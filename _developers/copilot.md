Below is the information you asked for—an explanation of GitHub Copilot’s stated “non‑training on your private code” behavior, grounded in the official GitHub documentation, plus pointers to related trust & security sources you can cite to a client.

### Core Statement (From Official Docs)
GitHub states that (by default) GitHub, its affiliates, and third parties will **not** use your data—this includes your prompts, Copilot’s suggestions, and code snippets—for AI model training. This is shown directly in your Copilot personal settings under “Model training and improvements.” See: [Managing GitHub Copilot policies as an individual subscriber](https://docs.github.com/en/copilot/how-tos/manage-your-account/manage-policies#model-training-and-improvements).

### What “Data” Refers To Here
In the cited settings page, “your data” explicitly covers:
- Prompts you type into Copilot (in IDE or on GitHub)
- Suggestions returned by Copilot
- Code snippets (surrounding code context sent for generation)
  All of these are excluded from being used to further train foundation or fine‑tuned models under the default setting.

### Where To Verify This (Steps)
1. On GitHub, click your profile avatar → Copilot settings.
2. Scroll to or open the “Model training and improvements” section.
3. You will see the statement that GitHub and permitted parties will not use your prompts, suggestions, or code snippets for AI model training. This is not a toggle you can turn on for personal accounts when the default is exclusion.

Reference: [Managing GitHub Copilot policies as an individual subscriber](https://docs.github.com/en/copilot/how-tos/manage-your-account/manage-policies#model-training-and-improvements)

### Relation to Public Code Matching
Separate from training: The “Suggestions matching public code” setting only governs whether near‑exact matches to public code are filtered or shown; it does not affect training behavior. See the same page: [Managing GitHub Copilot policies as an individual subscriber](https://docs.github.com/en/copilot/how-tos/manage-your-account/manage-policies#enabling-or-disabling-suggestions-matching-public-code).

### Enterprise / Organization Context
If you are using Copilot via an organization or enterprise seat:
- Certain preferences (e.g., blocking public‑code matches, enabling specific models) can be centrally controlled by organization or enterprise policies.
- The model training exclusion still applies by default; enterprise policies today focus on feature enablement, model selection, agents, prompt/suggestion collection for product improvements, etc., not enabling training on private source code.

(For agents and feature governance, see documents on coding agent configuration: [Managing GitHub Copilot policies as an individual subscriber](https://docs.github.com/en/copilot/how-tos/manage-your-account/manage-policies#disabling-or-enabling-copilot-coding-agent-in-your-repositories)).

### Distinguishing “Retention” vs “Training”
Clients often conflate transient processing/log retention with training:
- Copilot may need to transiently process code context to generate a suggestion.
- The documented default states this data is not fed back into model training pipelines.
  Provide both aspects in your compliance summary so the client sees the technical difference.

### How To Present This To a Client (Suggested Wording)
“Our GitHub Copilot Enterprise deployment does not permit GitHub or third parties to use our prompts, suggestions, or private code snippets for AI model training. This default is visible in Copilot settings (‘Model training and improvements’) and is not overridden by our enterprise policies.”

### Additional Trust & Policy References
For a more formal package, pair the above with:
- GitHub Copilot Terms for Additional Products and Features (linked from support pages).
- GitHub Copilot privacy FAQ (linked on the same settings page).
  If the client requests them, supply URLs with proper titles (always use the doc title as the link text).

### If They Ask for Proof or Audit
You can:
- Capture a screenshot of the “Model training and improvements” section in Copilot settings.
- Document the date/time and account used.
- Include a citation to the page URL and the verbatim statement.

### If the Client Requires a Change Log
Because this is a stated default rather than a user‑toggled training flag, track:
- Date of verification
- Any changes in GitHub’s documentation wording (review quarterly)
- Copilot plan type (Enterprise / Business / Pro) at time of verification

### Summary
GitHub’s official documentation currently states that your prompts, suggestions, and code snippets are not used for AI model training by default, and this is confirmed in the Copilot settings under “Model training and improvements.” This supports compliance assertions regarding non‑training on private code.

If you need more specific trust & security links (e.g., data residency or SOC reports), let me know and I can guide you to the correct sections.

Would you like a ready‑to‑send client briefing or compliance paragraph next? Just ask and I can draft it.
