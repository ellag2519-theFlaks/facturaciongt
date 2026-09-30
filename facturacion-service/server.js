import app from './src/app.js'
import env from './src/config/env.js'

const server = app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`)
})

export default server
