#!/usr/bin/env bash
# =============================================================================
# PostgreSQL Backup to Cloudflare R2
# =============================================================================
# Backs up the production database to R2 with compression and retention.
#
# Usage:
#   ./scripts/backup-db.sh              # Manual backup
#   ./scripts/backup-db.sh --cleanup    # Backup + delete old backups
#
# Prerequisites:
#   1. AWS CLI v2 installed: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
#   2. R2 credentials configured (see setup instructions below)
#
# Setup:
#   # Create R2 API token with Object Read & Write permissions
#   # Then configure AWS CLI:
#   aws configure --profile r2
#   # Access Key ID: your R2 access key
#   # Secret Access Key: your R2 secret key
#   # Region: auto
#   # Output format: json
#
# Cron (daily at 3 AM):
#   0 3 * * * /path/to/vacay-photo-map/scripts/backup-db.sh --cleanup >> /var/log/vacay-backup.log 2>&1
#
# =============================================================================
set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/tmp/vacay-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# R2 Configuration (override with environment variables if needed)
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"
R2_BUCKET="${R2_BACKUP_BUCKET:-vacay-backups}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
AWS_PROFILE="${AWS_PROFILE:-r2}"

# Docker Compose configuration
COMPOSE_PROJECT="vacay-prod"
COMPOSE_FILE="docker-compose.prod.yml"
DB_CONTAINER="vacay-postgres"
DB_USER="vacay"
DB_NAME="vacay"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Validation
# =============================================================================
validate_prerequisites() {
    log_info "Validating prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
        exit 1
    fi

    # Check R2 account ID
    if [[ -z "$R2_ACCOUNT_ID" ]]; then
        # Try to load from api/.env.production
        if [[ -f "$ROOT_DIR/api/.env.production" ]]; then
            R2_ACCOUNT_ID=$(grep -E "^R2_ACCOUNT_ID=" "$ROOT_DIR/api/.env.production" | cut -d'=' -f2 || true)
            R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        fi

        if [[ -z "$R2_ACCOUNT_ID" ]]; then
            log_error "R2_ACCOUNT_ID not set. Set it in environment or api/.env.production"
            exit 1
        fi
    fi

    # Check AWS profile exists
    if ! aws configure list --profile "$AWS_PROFILE" &> /dev/null; then
        log_error "AWS profile '$AWS_PROFILE' not configured. Run: aws configure --profile r2"
        exit 1
    fi

    # Check Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        exit 1
    fi

    # Check database container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
        log_error "Database container '$DB_CONTAINER' is not running"
        log_info "Start it with: docker compose -p $COMPOSE_PROJECT -f $COMPOSE_FILE up -d postgres"
        exit 1
    fi

    log_info "All prerequisites validated"
}

# =============================================================================
# Backup
# =============================================================================
create_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_filename="vacay_${timestamp}.sql.gz"
    local backup_path="${BACKUP_DIR}/${backup_filename}"

    log_info "Creating backup: $backup_filename"

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    # Dump database with compression
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$backup_path"

    # Verify backup was created and has content
    if [[ ! -s "$backup_path" ]]; then
        log_error "Backup file is empty or was not created"
        exit 1
    fi

    local size=$(du -h "$backup_path" | cut -f1)
    log_info "Backup created: $backup_path ($size)"

    echo "$backup_path"
}

upload_to_r2() {
    local backup_path="$1"
    local backup_filename=$(basename "$backup_path")
    local s3_path="s3://${R2_BUCKET}/db-backups/${backup_filename}"

    log_info "Uploading to R2: $s3_path"

    aws s3 cp "$backup_path" "$s3_path" \
        --profile "$AWS_PROFILE" \
        --endpoint-url "$R2_ENDPOINT" \
        --only-show-errors

    log_info "Upload complete"

    # Verify upload
    if aws s3 ls "$s3_path" --profile "$AWS_PROFILE" --endpoint-url "$R2_ENDPOINT" &> /dev/null; then
        log_info "Verified: backup exists in R2"
    else
        log_error "Verification failed: backup not found in R2"
        exit 1
    fi
}

cleanup_local() {
    local backup_path="$1"
    log_info "Cleaning up local backup file"
    rm -f "$backup_path"
}

# =============================================================================
# Retention (delete old backups)
# =============================================================================
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."

    local cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

    # List all backups and filter old ones
    local old_backups=$(aws s3 ls "s3://${R2_BUCKET}/db-backups/" \
        --profile "$AWS_PROFILE" \
        --endpoint-url "$R2_ENDPOINT" 2>/dev/null | \
        awk '{print $4}' | \
        grep -E "^vacay_[0-9]{8}_[0-9]{6}\.sql\.gz$" | \
        while read -r filename; do
            backup_date=$(echo "$filename" | grep -oE "[0-9]{8}" | head -1)
            if [[ "$backup_date" < "$cutoff_date" ]]; then
                echo "$filename"
            fi
        done)

    if [[ -z "$old_backups" ]]; then
        log_info "No old backups to delete"
        return
    fi

    local count=$(echo "$old_backups" | wc -l | tr -d ' ')
    log_info "Found $count old backup(s) to delete"

    echo "$old_backups" | while read -r filename; do
        log_info "Deleting: $filename"
        aws s3 rm "s3://${R2_BUCKET}/db-backups/${filename}" \
            --profile "$AWS_PROFILE" \
            --endpoint-url "$R2_ENDPOINT" \
            --only-show-errors
    done

    log_info "Cleanup complete"
}

# =============================================================================
# List backups
# =============================================================================
list_backups() {
    log_info "Listing backups in R2..."

    aws s3 ls "s3://${R2_BUCKET}/db-backups/" \
        --profile "$AWS_PROFILE" \
        --endpoint-url "$R2_ENDPOINT" \
        --human-readable
}

# =============================================================================
# Restore (for reference)
# =============================================================================
print_restore_instructions() {
    cat << 'EOF'

To restore a backup:

1. Download the backup:
   aws s3 cp s3://vacay-backups/db-backups/vacay_YYYYMMDD_HHMMSS.sql.gz ./restore.sql.gz \
     --profile r2 --endpoint-url https://YOUR_ACCOUNT.r2.cloudflarestorage.com

2. Stop the API:
   docker compose -p vacay-prod -f docker-compose.prod.yml stop api

3. Restore the database:
   gunzip -c restore.sql.gz | docker exec -i vacay-postgres psql -U vacay -d vacay

4. Start the API:
   docker compose -p vacay-prod -f docker-compose.prod.yml start api

EOF
}

# =============================================================================
# Main
# =============================================================================
main() {
    local do_cleanup=false
    local list_only=false
    local show_restore=false

    # Parse arguments
    for arg in "$@"; do
        case $arg in
            --cleanup)
                do_cleanup=true
                ;;
            --list)
                list_only=true
                ;;
            --restore-help)
                show_restore=true
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --cleanup       Delete backups older than $RETENTION_DAYS days"
                echo "  --list          List existing backups"
                echo "  --restore-help  Show restore instructions"
                echo "  --help          Show this help"
                echo ""
                echo "Environment variables:"
                echo "  R2_ACCOUNT_ID     Cloudflare account ID"
                echo "  R2_BACKUP_BUCKET  R2 bucket name (default: vacay-backups)"
                echo "  RETENTION_DAYS    Days to keep backups (default: 30)"
                echo "  AWS_PROFILE       AWS CLI profile (default: r2)"
                exit 0
                ;;
        esac
    done

    if [[ "$show_restore" == true ]]; then
        print_restore_instructions
        exit 0
    fi

    cd "$ROOT_DIR"

    validate_prerequisites

    if [[ "$list_only" == true ]]; then
        list_backups
        exit 0
    fi

    echo ""
    log_info "Starting backup at $(date)"
    echo "============================================="

    # Create and upload backup
    backup_path=$(create_backup)
    upload_to_r2 "$backup_path"
    cleanup_local "$backup_path"

    # Cleanup old backups if requested
    if [[ "$do_cleanup" == true ]]; then
        echo ""
        cleanup_old_backups
    fi

    echo "============================================="
    log_info "Backup complete at $(date)"
    echo ""
}

main "$@"
