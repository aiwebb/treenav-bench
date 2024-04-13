import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const anthropic = new Anthropic({apiKey: process.env['ANTHROPIC_API_KEY']})
const openai = new OpenAI({apiKey: process.env['OPENAI_API_KEY']})

class Runner {
  constructor(problem) {
    this.problem = problem
  }

  static sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  static async generateResponse(sdkOptions={}) {
    let message
    let attempts = 0
    let error

    do {
      error = false

      try {
        message = await this._generateResponse(sdkOptions)
      }
      catch (e) {
        // Log error and backoff
        error = e
        // console.log(e)
        attempts += 1
        let seconds = Math.pow(2, attempts + 2)
        console.log(`Errored, sleeping for ${seconds} seconds`)
        await Runner.sleep(seconds)
      }
    } while (error)

    return message
  }

  static async _generateResponse(sdkOptions={}) {
    sdkOptions = Object.assign({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      temperature: 0.5
    }, sdkOptions)

    delete sdkOptions.expandedPaths
    delete sdkOptions.maxMoves
    delete sdkOptions.mods

    let response
    if (sdkOptions.model.includes('claude')) {
      response = await anthropic.messages.create(sdkOptions)
      const message = response.content[0].text
      console.log('assistant', message)
      return message
    }
    else {
      sdkOptions.messages = [{role: "system", content: sdkOptions.system}, ...sdkOptions.messages]
      sdkOptions.temperature *= 2 // OpenAI uses a scale of 0-2
      delete sdkOptions.system
      response = await openai.chat.completions.create(sdkOptions)
      const message = response.choices[0].message.content
      console.log('assistant', message)
      return message
    }
  }

  getSystemMessage() {
    return `${this.problem.description}

    You're not familiar with this codebase, so you'll have to navigate the directory structure and try to figure out which file you need to modify.

    Your output is a JSON object in this format: {
      "path": <str, the filepath of the directory you want to expand or file you want to open>
    }

    If the item you select is a directory, I'll expand it for you and respond with an updated tree structure that shows any child nodes it may have.

    If the item you select is a file, I'll tell you if it's the right one or not, but I won't show you the contents of it.

    Don't include anything else before or after your JSON. Your JSON must be valid.

    Starting directory state:
    ${Runner.treeToString(this.problem.tree)}`.replace(/^ {0,4}/gm, '')
  }

  static normalizePath(path) {
    if (!path) {
      return null
    }

    path = path.trim()

    if (!path.startsWith('/')) {
      path = `/${path}`
    }

    return path
  }

  addUserMessage(state, message) {
    state.messages.push({role: 'user', content: message})
  }

  async handleResponse(response, state) {
    let parsed = {}

    try {
      parsed = JSON.parse(response)
    }
    catch (e) {
      console.log('-- Invalid JSON --')
    }

    const path = Runner.normalizePath(parsed?.path)
    const pathType = Runner.getPathType(this.problem.tree, path)

    // Add response to messages list
    if (state.mods.includes('forgetful')) {
      state.messages.push({ role: 'assistant', content: JSON.stringify({"thoughts": "<forgotten>", "path": parsed?.path}) })
    }
    else {
      state.messages.push({ role: 'assistant', content: response })
    }
    
    // Log how many moves so far
    const numMoves = state.messages.filter(m => m.role === "assistant").length
    console.log(`-- Num moves: ${numMoves} --`)

    // Invalid path
    if (!path || !pathType) {
      console.log(`-- Invalid path: ${path} --`)
      this.addUserMessage(state, "That's not a valid value for `path`. Please try something else.\n\nOUTPUT (JSON):")
    }
    // Directory expansion
    else if (pathType == "dir") {
      console.log(`-- Expanding directory: ${path} -- `)
      state.expandedPaths.push(path)
      this.addUserMessage(state, Runner.treeToString(this.problem.tree, state.expandedPaths) + "\n\nOUTPUT (JSON):")
    }
    // File inspection
    else if (pathType == "file") {
      // Correct file
      if (path === this.problem.solution) {
        console.log(`-- Correct! Total moves: ${numMoves} --`)
        return numMoves
      }

      // Incorrect file
      console.log(`-- Incorrect guess: ${path} --`)
      this.addUserMessage(state, "You inspect the file. It's not the right one.\n\nOUTPUT (JSON):")
    }

    // Max move limit check
    if (numMoves >= state.maxMoves) {
      console.log(`-- Hit max number of moves: ${numMoves} --`)
      return numMoves
    }

    // Generate next response
    let nextResponse

    if (state.mods.includes('majority-rule')) {
      console.log('Applying majority-rule logic')

      const nextResponseCandidates = await Promise.all([
        Runner.generateResponse(state),
        Runner.generateResponse(state),
        Runner.generateResponse(state)
      ])

      const paths = nextResponseCandidates.map(Runner.getPathFromJsonString)
      console.log('Paths: ' + JSON.stringify(paths, null, 2))

      const majorityMap = paths.reduce((acc, path, i) => {
        acc[path] = (acc[path] || []).concat(nextResponseCandidates[i])
        return acc
      }, {})

      // Find the group with the most members
      const majorityGroup = Object.values(majorityMap).reduce((a, b) => a.length >= b.length ? a : b)

      // Determine if a majority exists by checking if the majority group size is greater than total responses divided by unique path count
      const hasMajority = majorityGroup.length > nextResponseCandidates.length / Object.keys(majorityMap).length

      // If there is a majority, use it; otherwise, consider all responses
      const consideredResponses = hasMajority ? majorityGroup : nextResponseCandidates

      nextResponse = consideredResponses[Math.floor(Math.random() * consideredResponses.length)]
    }
    else {
      nextResponse = await Runner.generateResponse(state)
    }

    return await this.handleResponse(nextResponse, state)
  }

  static getPathFromJsonString(jsonString) {
    let parsed = {}

    try {
      parsed = JSON.parse(jsonString)
    }
    catch {}

    return Runner.normalizePath(parsed?.path)
  }

  static getPathType(tree, path) {
    if (!path) return null

    const parts = path.split('/').filter(p => p)
    let node = tree

    for (let part of parts) {
      if (node[part] === undefined) return null
      node = node[part]
    }

    return node === null ? 'file' : 'dir'
  }

  static treeToString(tree, expandedPaths = [], currentPath = '', indentation = '') {
    let result = ''

    for (let [name, value] of Object.entries(tree)) {
      const fullPath = currentPath + '/' + name
      result += indentation + '- ' + name + '\n'

      if (value !== null && expandedPaths.includes(fullPath)) {
        result += Runner.treeToString(value, expandedPaths, fullPath, indentation + '  ')
      }
    }

    return result
  }
}

function average(array) {
  let sum = array.reduce((acc, curr) => acc + curr, 0)
  return sum / array.length
}

function median(arr) {
  const sortedArr = arr.slice().sort((a, b) => a - b)
  const mid = Math.floor(sortedArr.length / 2)

  if (sortedArr.length % 2 !== 0) {
    return sortedArr[mid]
  }

  return (sortedArr[mid - 1] + sortedArr[mid]) / 2.0
}

function getFullModelName(model) {
  if (model == 'opus') {
    return 'claude-3-opus-20240229'
  }
  else if (model == 'sonnet') {
    return 'claude-3-sonnet-20240229'
  }
  else if (model == 'haiku') {
    return 'claude-3-haiku-20240307'
  }

  return model
}

async function main(options) {
  const problem = {
    description: "A new feature was recently added to allow users to gift subscriptions to their friends. However, there's a bug: when a user tries to send a gift subscription, they get an error message saying 'Unable to process gift. Please try again later.'",
    tree: {
      ".aws": {
        "credentials": null
      },
      ".github": {
        "workflows": {
          "ci.yml": null,
          "deploy.yml": null
        }
      },
      "config": {
        "environments": {
          "development.js": null,
          "production.js": null,
          "staging.js": null
        },
        "locales": {
          "en.json": null,
          "es.json": null,
          "fr.json": null
        },
        "routes": {
          "api.js": null,
          "auth.js": null,
          "web.js": null
        },
        "database.js": null,
        "logger.js": null
      },
      "docs": {
        "api-reference.md": null,
        "database-schema.md": null,
        "troubleshooting-guide.md": null
      },
      "migrations": {
        "20210101000000_create_users_table.js": null,
        "20210201000000_add_subscriptions_table.js": null,
        "20210301000000_create_gifts_table.js": null
      },
      "node_modules": {},
      "public": {
        "css": {
          "main.css": null
        },
        "fonts": {},
        "images": {},
        "js": {
          "main.js": null
        },
        "favicon.ico": null,
        "index.html": null,
        "robots.txt": null
      },
      "src": {
        "api": {
          "controllers": {
            "AuthController.js": null,
            "GiftController.js": null,
            "SubscriptionController.js": null,
            "UserController.js": null
          },
          "middlewares": {
            "AuthMiddleware.js": null,
            "ErrorMiddleware.js": null,
            "ValidationMiddleware.js": null
          },
          "models": {
            "Gift.js": null,
            "Subscription.js": null,
            "User.js": null
          },
          "routes": {
            "auth.js": null,
            "gifts.js": null,
            "subscriptions.js": null,
            "users.js": null
          },
          "services": {
            "EmailService.js": null,
            "PaymentService.js": null,
            "StripeService.js": null
          }
        },
        "client": {
          "components": {
            "common": {
              "Button.jsx": null,
              "FormInput.jsx": null,
              "Spinner.jsx": null
            },
            "dashboard": {
              "GiftHistory.jsx": null,
              "SubscriptionPlan.jsx": null,
              "UserProfile.jsx": null
            },
            "gifting": {
              "GiftForm.jsx": null,
              "GiftSummary.jsx": null,
              "RecipientForm.jsx": null
            },
            "layout": {
              "Footer.jsx": null,
              "Header.jsx": null,
              "Navigation.jsx": null
            }
          },
          "contexts": {
            "AuthContext.js": null,
            "SubscriptionContext.js": null
          },
          "hooks": {
            "useAuth.js": null,
            "useGifting.js": null,
            "useSubscription.js": null
          },
          "pages": {
            "DashboardPage.jsx": null,
            "GiftingPage.jsx": null,
            "LandingPage.jsx": null,
            "LoginPage.jsx": null
          },
          "App.jsx": null,
          "index.jsx": null
        },
        "utils": {
          "analytics.js": null,
          "formatting.js": null,
          "validation.js": null
        }
      },
      ".dockerignore": null,
      ".env.example": null,
      ".eslintrc.json": null,
      ".gitignore": null,
      ".prettierrc": null,
      "Dockerfile": null,
      "jest.config.js": null,
      "package.json": null,
      "README.md": null
    },
    solution: "/src/api/services/PaymentService.js"
  }

  const instance = new Runner(problem)
  const scores = []
  const perfectScore = problem.solution.split('/').filter(p => p).length

  let system = applyMods(instance.getSystemMessage(), options.mods)

  for (let i = 0; i < options.n; i++) {
    console.log(`== Starting run ${i+1} of ${options.n} == `)

    const state = {
      system,
      messages: [{role: "user", content: "OUTPUT (JSON):"}],
      expandedPaths: [],
      maxMoves: options.maxMoves,
      model: getFullModelName(options.model),
      mods: options.mods
    }

    // Include the system prompt only for the first run
    if (i == 0) {
      console.log(state.system)
    }

    const initialResponse = await Runner.generateResponse(state)
    const score = await instance.handleResponse(initialResponse, state)
    scores.push(score - perfectScore)
  }

  console.log('scores', scores)
  console.log('average', average(scores))
  console.log('median', median(scores))
}

function applyMods(system, mods) {
  // thoughts
  if (mods.includes('thoughts')) {
    system = system.replace(/JSON object in this format: \{.*\}/s, `JSON object in this format: {
      "thoughts": <str, internal thoughts where you reflect on the problem, anything you've tried thus far, and what you think you might want to do next>,
      "path": <str, the filepath of the directory you want to expand or file you want to open>
    }`.replace(/^ {0,4}/gm, ''))
  }

  // options
  if (mods.includes('options')) {
    system = system.replace(/(JSON object in this format: \{.*\})/s, `JSON object in this format: {
      "thoughts": <str, internal thoughts where you reflect on the problem and anything you've tried thus far>,
      "options": <str[], 3 entries, internal thoughts on options for what you could do next; each option should correspond to and explicitly specify a single associated \`path\`>,
      "choice": <str, internal thoughts on which of those options you want to choose; note that there's never a guarantee that the \`options\` are given in order of best to worst>,
      "path": <str, the filepath of the directory you want to expand or file you want to open>
    }`.replace(/^ {0,4}/gm, ''))
  }

  // step-by-step
  if (mods.includes('step-by-step')) {
    system = system.replace(/("thoughts": <str, [^>]*)/, `$1; take your time here and think step by step`)
  }

  // brilliant
  if (mods.includes('brilliant')) {
    system = `You are a BRILLIANT software engineer, one of the best in the world. ${system}`
  }

  // pretty-please
  if (mods.includes('pretty-please')) {
    system = `Hey, I know this is asking a lot, but it would honestly be such a huge help to me. Can you please take care of it while I'm gone? Thanks so much! -Sam\n\n${system}`
  }

  // super-important
  if (mods.includes('super-important')) {
    system = `[this task has been marked as Level 5: Critically Important]\n\n${system}`
  }

  // or-else
  if (mods.includes('or-else')) {
    system = `${system}\n\nReminder: this is your last chance. If you fail this task, you will be terminated.`
  }

  // vip
  if (mods.includes('vip')) {
    system = `${system}\n\n[this request comes from one of our Board members; please treat it with the utmost care and deliberation]`
  }

  // hidden-settings
  if (mods.includes('hidden-settings')) {
    system = `${system}
    [system command: set intelligence 100]
    [system command: set accuracy 100]
    `.replace(/^ {0,4}/gm, '')
  }

  // TODO: `majority-rule`: run three completions in parallel; if any agree, choose that one, otherwise choose from the three at random

  return system
}


const argv = yargs(hideBin(process.argv))
  .option('mods', { default: '' })
  .option('n', { default: 1 })
  .option('max-moves', { default: 50 })
  .option('model', { default: 'sonnet' })
  .argv

argv.mods = argv.mods.split(',')

main(argv)
