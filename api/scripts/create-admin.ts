/**
 * Create an admin user directly in the database.
 *
 * Usage:
 *   bun run scripts/create-admin.ts
 *   # or via package.json:
 *   pnpm create-admin
 *
 * This script is used for initial setup when deploying a fresh instance.
 * Registration is invite-only, so the first admin must be created via CLI.
 *
 * Security notes:
 * - Uses interactive prompts (passwords don't end up in shell history)
 * - Requires DATABASE_URL from environment (.env or .env.prod)
 * - Safe to commit - no secrets in this file
 */

import { closeDbClient, getDbClient } from '../src/db/client'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

const prompt = (question: string): Promise<string> => {
  process.stdout.write(question)
  return new Promise((resolve) => {
    let input = ''
    process.stdin.setRawMode?.(false)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', (data) => {
      input = data.toString().trim()
      resolve(input)
    })
  })
}

const promptHidden = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    process.stdout.write(question)
    let input = ''

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')

      const onData = (char: string) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.setRawMode?.(false)
          process.stdin.removeListener('data', onData)
          process.stdout.write('\n')
          resolve(input)
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit(1)
        } else if (char === '\u007F' || char === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1)
          }
        } else {
          input += char
        }
      }

      process.stdin.on('data', onData)
    } else {
      // Fallback for environments without setRawMode
      console.warn('\n  Warning: Raw mode not supported. Password will be visible as you type.')
      process.stdin.resume()
      process.stdin.setEncoding('utf8')
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim())
      })
    }
  })
}

const createAdmin = async () => {
  const db = getDbClient()

  console.info('\n  Create Admin User\n')

  // Get email
  const email = await prompt('Email: ')
  if (!email) {
    console.error('Email is required')
    process.exitCode = 1
    return
  }

  // Validate email format
  if (!EMAIL_REGEX.test(email)) {
    console.error('\n  Invalid email format')
    process.exitCode = 1
    return
  }

  const sanitizedEmail = email.toLowerCase().trim()

  // Check if user with this email already exists (early check)
  const [existingUser] = await db<{ id: string }[]>`
    SELECT id FROM user_profiles WHERE email = ${sanitizedEmail}
  `

  if (existingUser) {
    console.error(`\n  User with email ${sanitizedEmail} already exists`)
    console.info('  Use "pnpm reset-password" to reset their password instead.')
    process.exitCode = 1
    return
  }

  // Get password
  const password = await promptHidden('Password: ')
  if (!password) {
    console.error('Password is required')
    process.exitCode = 1
    return
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    process.exitCode = 1
    return
  }

  const confirmPassword = await promptHidden('Confirm password: ')
  if (password !== confirmPassword) {
    console.error('\n  Passwords do not match')
    process.exitCode = 1
    return
  }

  // Get display name (optional)
  const displayName = await prompt('Display name (optional, press Enter to skip): ')
  const sanitizedDisplayName = displayName.trim() || null

  // Show confirmation
  console.info('\n  Summary:')
  console.info(`  Email: ${sanitizedEmail}`)
  console.info(`  Display name: ${sanitizedDisplayName || '(not set)'}`)
  console.info('  Role: Admin')

  const confirm = await prompt('\nCreate admin user? (y/N): ')
  if (confirm.toLowerCase() !== 'y') {
    console.info('Cancelled')
    return
  }

  // Hash password and create user
  const passwordHash = await Bun.password.hash(password)

  const [newUser] = await db<{ id: string; email: string }[]>`
    INSERT INTO user_profiles (email, password_hash, display_name, is_admin)
    VALUES (${sanitizedEmail}, ${passwordHash}, ${sanitizedDisplayName}, true)
    RETURNING id, email
  `

  console.info(`\n  Admin user created successfully!`)
  console.info(`  ID: ${newUser.id}`)
  console.info(`  Email: ${newUser.email}`)
  console.info('\n  Next steps:')
  console.info('  1. Start the server: pnpm dev:docker')
  console.info('  2. Navigate to http://localhost:5173/login')
  console.info('  3. Log in with your new admin credentials')
  console.info('  4. Create invites for other users at /admin/invites')
}

createAdmin()
  .catch((error) => {
    console.error(
      '\nFailed:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDbClient()
    process.exit(process.exitCode)
  })
