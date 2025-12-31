/**
 * Set or reset a user's password directly in the database.
 *
 * Usage:
 *   bun run scripts/set-password.ts
 *
 * Security notes:
 * - Uses interactive prompts (passwords don't end up in shell history)
 * - Requires DATABASE_URL from environment (.env or .env.prod)
 * - Safe to commit - no secrets in this file
 */

import { closeDbClient, getDbClient } from '../src/db/client'

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
      process.stdin.resume()
      process.stdin.setEncoding('utf8')
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim())
      })
    }
  })
}

const setPassword = async () => {
  const db = getDbClient()

  console.info('\n🔐 Set User Password\n')

  // Get email
  const email = await prompt('Email: ')
  if (!email) {
    console.error('Email is required')
    process.exitCode = 1
    return
  }

  // Check if user exists
  const [user] = await db`
    SELECT id, email, display_name, is_admin
    FROM user_profiles
    WHERE email = ${email}
  `

  if (!user) {
    console.error(`\n❌ No user found with email: ${email}`)
    process.exitCode = 1
    return
  }

  console.info(`\nFound user: ${user.display_name || user.email} ${user.is_admin ? '(admin)' : ''}`)

  // Get password
  const password = await promptHidden('New password: ')
  if (!password) {
    console.error('Password is required')
    process.exitCode = 1
    return
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters')
    process.exitCode = 1
    return
  }

  const confirmPassword = await promptHidden('Confirm password: ')
  if (password !== confirmPassword) {
    console.error('\n❌ Passwords do not match')
    process.exitCode = 1
    return
  }

  // Confirm
  const confirm = await prompt(`\nUpdate password for ${email}? (y/N): `)
  if (confirm.toLowerCase() !== 'y') {
    console.info('Cancelled')
    return
  }

  // Hash and update
  const passwordHash = await Bun.password.hash(password)
  await db`
    UPDATE user_profiles
    SET password_hash = ${passwordHash}
    WHERE id = ${user.id}
  `

  console.info(`\n✅ Password updated for ${email}`)
}

setPassword()
  .catch((error) => {
    console.error(
      '\nFailed:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDbClient()
    process.exit()
  })
