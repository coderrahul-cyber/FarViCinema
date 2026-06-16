// run: node generate-token.js
import jwt from 'jsonwebtoken'

const token = jwt.sign(
  { id: 'user-test-3', name: 'Test User2' },
  'hirahulsinghsmant9012',   // ← must match JWT_SECRET in ws-server/.env
  { expiresIn: '24h' }
)

console.log(token)