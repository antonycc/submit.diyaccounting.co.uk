# Prune to Improve Focus Prompt

Analyze the current repository and identify areas where code, features, or processes can be pruned to improve focus and maintainability.

Focus on:
- Removal of unused code, dependencies, or configuration files
- Simplification of overly complex components or workflows
- Consolidation of duplicate or similar functionality
- Removal of experimental or deprecated features
- Streamlining of configuration and environment handling
- Simplification of build and deployment processes
- Reduction of cognitive load in key modules

Examine areas for pruning:
- Dead code in JavaScript/TypeScript files
- Unused dependencies in package.json and pom.xml
- Redundant configuration in .env files
- Overcomplicated test setups
- Unnecessary GitHub Actions workflows or steps
- Overly verbose logging or debugging code
- Complex conditional logic that could be simplified
- Unused AWS resources or CDK stacks

Provide specific recommendations to:
- Remove safely without breaking existing functionality
- Reduce maintenance burden
- Improve code readability and understanding
- Decrease build times and resource usage
- Simplify developer onboarding
- Focus on core business value

Consider the impact on:
- Existing tests and their coverage
- Current deployment processes
- Developer workflow efficiency
- System reliability and monitoring

> Formatting and style: Respect the repo’s formatting tools — ESLint (flat) + Prettier for JS (ESM) and Spotless (Palantir Java Format) for Java. Use npm run formatting / npm run formatting-fix. See README for details.
> Do not apply styles changes to code that you are not otherwise changes and prefer to match the existing local style when applying the style guides would be jarring.
