import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

// Generate a new private key
const privateKey = generatePrivateKey()

// Create an account from the private key
const account = privateKeyToAccount(privateKey)

console.log('Generated Account:')
console.log('Private Key:', privateKey)
console.log('Address:', account.address)
