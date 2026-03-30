export function validateToken(token: string): boolean {
  // Token validation logic
  return token.length > 0 && token.startsWith('Bearer ');
}

export function hashPassword(password: string): string {
  // Password hashing using bcrypt
  return password; // simplified
}
