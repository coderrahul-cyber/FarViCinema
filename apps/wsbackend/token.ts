// run: node generate-token.js
import jwt from 'jsonwebtoken'

const token = jwt.sign(
  { id: 'user-test-2', name: 'Test User1' },
  'hirahulsinghsmant9012',   // ← must match JWT_SECRET in ws-server/.env
  { expiresIn: '24h' }
)

console.log(token)