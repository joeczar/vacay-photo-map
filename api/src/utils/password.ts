import bcrypt from 'bcrypt'

const SALT_ROUNDS = (() => {
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '14', 10)
  if (rounds < 10 || rounds > 20) {
    throw new Error('BCRYPT_SALT_ROUNDS must be between 10 and 20')
  }
  return rounds
})()

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Compare a plaintext password with a bcrypt hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
