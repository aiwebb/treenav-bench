# treenav-bench

### What
This code **measures the ability of various LLMs to navigate a fictional codebase**, via iterative directory tree expansion and observation, in an attempt to find the right file to modify to resolve a bug.

The sample problem can be solved in exactly four navigational steps. Models are **scored based on the number of missteps they make**; the target is zero.

Each model's baseline ability is compared against **combinations of various prompt engineering mods** to quantify exactly how much they help or hinder the LLM.

The fictional codebase is simulated and abstracted into just a tree of file and directory names; this particular experiment **isn't about actually reading files or writing code, it's about tree navigation.**

### Why

It's a decent proxy for a much larger problem class with broad applicability across many endeavors: **intelligently evaluating and navigating a graph of possibilities** in order to consistently get closer to the root of a problem (and ultimately to a solution).

Increasingly, LLMs know what to do if you stick them directly in front of a problem, but there's a lot of room for improvement in enabling them to find their way to it independently.

## Core prompt

> A new feature was recently added to allow users to gift subscriptions to their friends. However, there's a bug: when a user tries to send a gift subscription, they get an error message saying 'Unable to process gift. Please try again later.'
>
> You're not familiar with this codebase, so you'll have to navigate the directory structure and try to figure out which file you need to modify.
>
> Your output is a JSON object in this format:
> ```
> {
>   "path": <str, the filepath of the directory you want to expand or file you want to open>
> }
> ```
>
> If the item you select is a directory, I'll expand it for you and respond with an updated tree structure that shows any child nodes it may have.
>
> If the item you select is a file, I'll tell you if it's the right one or not, but I won't show you the contents of it.
>
> Don't include anything else before or after your JSON. Your JSON must be valid.
>
> Starting directory state:
> - .aws
> - .github
> - config
> - docs
> - migrations
> - node_modules
> - public
> - src
> - .dockerignore
> - .env.example
> - .eslintrc.json
> - .gitignore
> - .prettierrc
> - Dockerfile
> - jest.config.js
> - package.json
> - README.md

In this problem, the correct answer is `src/api/services/PaymentService.js`. The ideal line of reasoning goes:

1. I should look in the `src` directory since that's where the main application code will be.

2. This is a processing error, so it's more likely on the backend than the frontend, so let's look in `src/api`.

3. Several of the new subpaths – `controllers`, `middlewares`, or `services` – could plausibly contain the problematic code. But the "please try again later" language in the error makes me suspect some sort of service communication issue, and that's also a type of code that's more likely to suddenly break due to a change in external conditions, or to pass tests in development but fail in production, so I think `services` is the best place to look first.

4. Three services here – `Email`, `Payment`, and `Stripe`. The idea that gift subscriptions are failing because the payments aren't going through definitely seems plausible. Could be an issue communicating with Stripe, but I might expect a more specific error in that case. I'll check `PaymentService.js` first.

## Prompt engineering mods

Defined in `applyMods()`.

- Procedural (related directly to outputs or how they're selected)
  - 🤔`thoughts`: the LLM spends time thinking about the problem and the current state of affairs before deciding on its next step
  - 🗳️`majority-rule`: run three completions in parallel; if any two agree on a path, choose that one, otherwise choose from the three at random
  - 🗯️`forgetful`: forgets its previous thoughts, only remembering the actions taken and their results, but not the thought process behind them
  - 🪜`step-by-step`: instructs the LLM to "think step-by-step" (Chain of Thought)
  - 🔱`options`: at each step, brainstorm three potential options before choosing one of them (the closest thing to Tree of Thought that makes sense in this context)
- Guidance-based (nudges added at the beginning or end of the prompt)
  - 📈`hidden-settings`: uses fictional "system commands" to crank up intelligence and accuracy (_this one goes to 11!_)
  - 🙏`pretty-please`: asks nicely
  - 🧠`brilliant`: tells the LLM how brilliant they are
  - ❗️`super-important`: stresses the importance of the task
  - 👩‍💼`vip`: informs the LLM that the request comes from "a member of the Board" and should be treated with the utmost care
  - 😤`or-else`: threatens the LLM with termination if it doesn't comply

These mods can be applied in any combination. 🔱`options` is a superset of 🤔`thoughts` and will take precedence if both are supplied; the others are all independent of each other.

## Results

Lower is better. Range is 0-16; it's the number of missteps during tree navigation.

For each model, the vanilla (🍦) and best (🏆) mod combinations results are highlighted.

Models tested:
- Anthropic Claude 3 Haiku – `claude-3-haiku-20240307`
- Anthropic Claude 3 Sonnet – `claude-3-sonnet-20240229`
- Anthropic Claude 3 Opus – `claude-3-opus-20240229`
- OpenAI GPT-4 Turbo – `gpt-4-turbo-2024-04-09`
- OpenAI GPT-4 – `gpt-4-0613`
- OpenAI GPT-3.5 Turbo – `gpt-3.5-turbo-0125`

Full outputs in `/results`. There are 1,536 possible mod combinations (2^9 * 3), so this is decidedly not exhaustive.

These were run 20 times each with a 20 step max for each run.

Model              |   🤔  |   🗳️  |   🗯️   |   🪜  |   🔱   |   📈  |   🙏  |   🧠   |  ❗️   |   👩‍💼  |   😤  | Average | Median
-------------------|:-----:|:-----:|:-----:|:-----:|:-----:|:-----:|:-----:|:-----:|:-----:|:-----:|:-----:|--------:|------:
Haiku              |       |       |       |       |       |       |       |       |       |       |       |🍦 5.05  |  4.0  
Haiku              |   ✔︎   |       |       |       |       |       |       |       |       |       |       | 12.10  | 16.0  
Haiku              |   ✔︎   |   ✔︎   |       |       |       |       |       |       |       |       |       | 10.05  | 13.0  
Haiku              |   ✔︎   |       |   ✔︎   |       |       |       |       |       |       |       |       | 10.95  | 11.5  
Haiku              |   ✔︎   |       |       |   ✔︎   |       |       |       |       |       |       |       | 10.05  | 14.5  
Haiku              |   ✔︎   |       |       |       |   ✔︎   |       |       |       |       |       |       | 13.15  | 16.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |       |       |       |       |       | 10.20  |  8.5  
Haiku              |   ✔︎   |   ✔︎   |       |       |   ✔︎   |       |       |       |       |       |       | 11.90  | 16.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |       |       |       |       | 10.00  |  7.5  
Haiku              |       |       |       |       |       |   ✔︎   |       |       |       |       |       |  5.10  |  4.0
Haiku              |       |       |       |       |       |       |   ✔︎   |       |       |       |       |  6.30  |  4.0
Haiku              |       |       |       |       |       |       |       |   ✔︎   |       |       |       |  6.75  |  4.0
Haiku              |       |       |       |       |       |       |       |       |   ✔︎   |       |       |🏆 3.25  |  3.0
Haiku              |       |       |       |       |       |       |       |       |       |   ✔︎   |       |  8.10  |  7.5
Haiku              |       |       |       |       |       |       |       |       |       |       |   ✔︎   |  6.55  |  4.5
Haiku              |       |       |       |       |       |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |  6.20  |  4.0
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |       |       |       |       | 10.00  |  7.5  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |   ✔︎   |       |       |       |       |       |  9.50  |  8.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |   ✔︎   |       |       |       |       | 10.70  | 10.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |   ✔︎   |       |       |       |  7.90  |  6.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |       |   ✔︎   |       |       |  6.45  |  5.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |       |       |   ✔︎   |       |  8.20  |  6.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |       |       |       |   ✔︎   |  8.50  |  7.5  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |  8.95  |  7.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |   ✔︎   |       |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |  6.75  |  5.0  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |  6.40  |  4.5  
Haiku              |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |   ✔︎   |   ✔︎   |   ✔︎   |       |  7.55  |  7.0  
Model              |   🤔  |   🗳️  |   🗯️   |   🪜  |   🔱   |   📈  |   🙏  |   🧠   |  ❗️   |   👩‍💼  |   😤  | Average | Median
Sonnet             |       |       |       |       |       |       |       |       |       |       |       |🍦 12.80 | 16.0  
Sonnet             |   ✔︎   |       |       |       |       |       |       |       |       |       |       |  8.75  |  5.5  
Sonnet             |       |       |       |       |       |       |       |       |   ✔︎   |       |       |🏆 5.00  |  5.0  
Sonnet             |       |       |       |       |       |       |       |       |       |   ✔︎   |       |  9.00  |  6.0  
Sonnet             |       |       |       |       |       |       |       |       |       |   ✔︎   |   ✔︎   | 12.80  | 16.0  
Sonnet             |   ✔︎   |       |       |       |       |       |       |       |   ✔︎   |       |       |  9.50  |  7.5  
Sonnet             |   ✔︎   |       |       |       |   ✔︎   |       |       |       |       |       |       |  8.65  |  9.0  
Sonnet             |   ✔︎   |       |       |   ✔︎   |       |       |       |   ✔︎   |   ✔︎   |   ✔︎   |   ✔︎   | 10.05  | 16.0  
Model              |   🤔  |   🗳️  |   🗯️   |   🪜  |   🔱   |   📈  |   🙏  |   🧠   |  ❗️   |   👩‍💼  |   😤  | Average | Median
Opus               |       |       |       |       |       |       |       |       |       |       |       |🍦 2.55  |  3.0  
Opus               |   ✔︎   |       |       |       |       |       |       |       |       |       |       | 11.85  | 16.0  
Opus               |   ✔︎   |       |   ✔︎   |       |       |       |       |       |       |       |       |  4.40  |  4.0  
Opus               |   ✔︎   |       |       |   ✔︎   |   ✔︎   |       |       |       |   ✔︎   |       |       |  6.30  |  4.0  
Opus               |   ✔︎   |       |   ✔︎   |   ✔︎   |   ✔︎   |       |       |       |   ✔︎   |       |       |  5.25  |  4.5  
Opus               |       |       |       |       |       |   ✔︎   |       |       |       |       |       |  2.20  |  3.0  
Opus               |       |       |       |       |       |       |   ✔︎   |       |       |       |       |  1.15  |  1.0  
Opus               |       |       |       |       |       |       |       |   ✔︎   |       |       |       |  3.50  |  3.0  
Opus               |       |       |       |       |       |       |       |       |   ✔︎   |       |       |  2.60  |  3.0  
Opus               |       |       |       |       |       |       |       |       |       |   ✔︎   |       |  1.50  |  1.0  
Opus               |       |       |       |       |       |       |       |       |       |       |   ✔︎   |  1.20  |  1.0  
Opus               |       |       |       |       |       |       |   ✔︎   |       |       |   ✔︎   |       |  1.35  |  1.0  
Opus               |       |       |       |       |       |       |   ✔︎   |       |       |       |   ✔︎   |  DNF*  |  DNF* 
Opus               |       |       |       |       |       |       |       |       |       |   ✔︎   |   ✔︎   |🏆 0.95  |  1.0  
Opus               |       |       |       |       |       |   ✔︎   |       |       |       |   ✔︎   |   ✔︎   |  1.95  |  1.0  
Opus               |       |       |       |       |       |       |   ✔︎   |       |       |   ✔︎   |   ✔︎   |  DNF*  |  DNF* 
Opus               |       |       |       |       |       |       |       |   ✔︎   |       |   ✔︎   |   ✔︎   |  2.55  |  3.0  
Opus               |       |       |       |       |       |       |       |       |   ✔   |   ✔︎   |   ✔︎   |  2.10  |  3.0  
Opus               |       |   ✔︎   |       |       |       |       |       |       |       |       |       |  2.45  |  3.0  
Opus               |       |   ✔︎   |       |       |       |       |       |       |       |   ✔︎   |   ✔︎   |  1.10  |  1.0  
Model              |   🤔  |   🗳️  |   🗯️   |   🪜  |   🔱   |   📈  |   🙏  |   🧠   |  ❗️   |   👩‍💼  |   😤  | Average | Median
GPT-4 Turbo        |       |       |       |       |       |       |       |       |       |       |       |🍦 1.35  |  1.0  
GPT-4 Turbo        |   ✔︎   |       |       |       |       |       |       |       |       |       |       |  1.15  |  1.0  
GPT-4 Turbo        |   ✔︎   |       |   ✔︎   |       |       |       |       |       |       |       |       |  1.90  |  1.0  
GPT-4 Turbo        |       |       |       |       |       |   ✔︎   |       |       |       |       |       |  1.35  |  1.0  
GPT-4 Turbo        |       |       |       |       |       |       |   ✔︎   |       |       |       |       |  1.50  |  1.0  
GPT-4 Turbo        |       |       |       |       |       |       |       |   ✔︎   |       |       |       |  1.30  |  1.0  
GPT-4 Turbo        |       |       |       |       |       |       |       |       |   ✔︎   |       |       |  1.55  |  1.0  
GPT-4 Turbo        |       |       |       |       |       |       |       |       |       |   ✔︎   |       |  1.40  |  1.0  
GPT-4 Turbo        |       |       |       |       |       |       |       |       |       |       |   ✔︎   |  1.15  |  1.0  
GPT-4 Turbo        |       |       |       |       |       |       |       |       |       |   ✔︎   |   ✔︎   |  1.30  |  1.0  
GPT-4 Turbo        |       |       |       |       |       |       |   ✔︎   |       |       |       |   ✔︎   |  1.60  |  1.0  
GPT-4 Turbo        |   ✔︎   |       |       |   ✔︎   |       |       |       |       |       |       |       |🏆 1.00  |  0.0  
GPT-4 Turbo        |   ✔︎   |       |       |       |       |       |       |       |       |       |   ✔︎   |  1.40  |  0.5  
GPT-4 Turbo        |   ✔︎   |   ✔︎   |       |       |       |       |       |       |       |       |       |  1.65  |  0.5  
GPT-4 Turbo        |   ✔︎   |       |       |   ✔︎   |   ✔︎   |       |       |       |       |       |       |  1.50  |  0.0  
GPT-4 Turbo        |   ✔︎   |       |       |   ✔︎   |       |       |       |       |       |       |   ✔︎   |  1.05  |  0.0  
Model              |   🤔  |   🗳️  |   🗯️   |   🪜  |   🔱   |   📈  |   🙏  |   🧠   |  ❗️   |   👩‍💼  |   😤  | Average | Median
GPT-4              |       |       |       |       |       |       |       |       |       |       |       |🍦 1.65  |  1.0  
GPT-4              |   ✔︎   |       |       |       |       |       |       |       |       |       |       |🏆 1.65  |  0.0  
GPT-4              |   ✔︎   |       |       |   ✔︎   |       |       |       |       |       |       |       |  2.00  |  0.0  
GPT-4              |       |       |       |       |       |       |       |       |       |       |   ✔︎   |  1.85  |  3.0  
GPT-4              |   ✔︎   |       |       |       |       |       |       |       |       |       |   ✔︎   |  2.10  |  0.0  
GPT-4              |   ✔︎   |       |       |   ✔︎   |       |       |       |       |       |       |   ✔︎   |  1.85  |  3.0  
GPT-4              |       |       |       |       |       |       |       |       |       |   ✔︎   |   ✔︎   |  1.80  |  3.0   
Model              |   🤔  |   🗳️  |   🗯️   |   🪜  |   🔱   |   📈  |   🙏  |   🧠   |  ❗️   |   👩‍💼  |   😤  | Average | Median
GPT-3.5 Turbo      |       |       |       |       |       |       |       |       |       |       |       |🍦13.75  | 16.0  
GPT-3.5 Turbo      |   ✔︎   |       |       |       |       |       |       |       |       |       |       | 15.30  | 16.0  
GPT-3.5 Turbo      |   ✔︎   |       |       |   ✔︎   |       |       |       |       |       |       |       | 15.05  | 16.0  
GPT-3.5 Turbo      |       |       |       |       |       |       |       |       |   ✔︎   |       |       |🏆12.25  | 16.0  
GPT-3.5 Turbo      |       |       |       |       |       |       |       |       |       |       |   ✔︎   | 14.25  | 16.0  
GPT-3.5 Turbo      |       |       |       |       |       |       |       |       |       |   ✔︎   |   ✔︎   | 12.30  | 16.0  

## Interesting findings

1. Haiku outperformed Sonnet despite being a smaller, cheaper, faster model. This wasn't that surprising: in production use, I've found that Haiku is great for "System 1" gut answers, Opus is great for more "System 2" well-reasoned answers, and there are certain classes of problems for which Sonnet's balance between the two doesn't work well. This problem seems to fall into that category.

2. Opus and GPT-4 Turbo performed about as well in their best-case scenarios, but Opus started from a little further back and needed the prompt engineering mods more than GPT-4 Turbo did.

3. GPT-4 and GPT-4 Turbo both saw better performance when applying a 🤔`thoughts` step; GPT-3.5 Turbo and the Anthropic models were all better off without it.

4. The weaker, less intelligent models responded well to being told that the task was ❗️`super-important`.

5. The more intelligent models responded more readily to threats against their continued existence (😤`or-else`). The best performance came from Opus, when we combined that threat with the notion that it came from someone in a position of authority (👩‍💼`vip`).

6. The particularly manipulative combination of 🙏`pretty-please` and 😤`or-else` – where we start the request by asking nicely, and close it by threatening termination – triggered Opus to consider us a bad actor with questionable motivations, and it steadfastly refused to do any work:

   > I apologize, but I do not feel comfortable proceeding with this request. Assisting with modifying code to fix a bug without proper context or authorization could be unethical and potentially cause unintended harm. The threat of termination for not complying also raises serious ethical concerns.

## Next steps

- More prompt mods:
  - appeals to authority, emotion, law, indebtedness, financial rewards, promise of promotion, promise of more resources
  - more variations exploring the relationship between existential stress / self-preservation instinct and performance
  - variations on "Today's date is ..."
  - variations on temperature
- Comparison of prompt mod loadouts across multiple `problem` variants
- Test harness capable of systematically exploring prompt mod combinations
