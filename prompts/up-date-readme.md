# Update to the README and SETUP docs

Please update README and SETUP documentation

* Review the existing README and SETUP docs, compare their instructions (including all steps and examples) with how the current codebase actually behaves now.
* Assume the current code is the source of truth. Where the docs are outdated or inconsistent, update them accordingly.
* Write a step-by-step guide for a new developer to create their own local environment — using their own credentials (ngrok account, domain name, HMRC credentials, test data).
* In the guide, describe what must go into the .env file. Use placeholder names in the docs (e.g. NGROK_AUTHTOKEN, BASE_DOMAIN, HMRC_CLIENT_ID, etc.). Make clear that these values are secrets required for the behaviour tests, and that real plaintext values should not be committed to repo.
* Document the exact commands and steps needed to run the various tests, culminating in running npm run test:all.
* Also include a section covering what’s required to deploy to AWS — based on production configuration — but targeting a different custom domain (i.e. “if you want to deploy for your own domain, here is what to do”).
* Do not add fluff or marketing-style padding. The output should be a clean, minimal, and accurate developer guide.
* Do not self-celebrate or add meta commentary. Focus on clear, concise, and accurate instructions.

