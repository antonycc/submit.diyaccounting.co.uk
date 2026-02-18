  ---
Phase 1.0: Your AWS console walkthrough

Everything below happens in the AWS console or CLI, logged into 887764105431.

Step 1: Enable AWS Organizations

1. Sign into 887764105431 at https://console.aws.amazon.com
2. Go to AWS Organizations → Create an organization
3. Select Enable all features (not just consolidated billing)
4. This makes 887764105431 the management account — permanent, cannot be changed later

Verify:

aws organizations describe-organization


Step 2: Create Organizational Units

In Organizations → AWS accounts → click Root:

1. Actions → Create new → Name: Workloads
2. Actions → Create new → Name: Backup

You now have:

Root
├── Workloads (empty)
└── Backup (empty)


887764105431 itself sits at Root level (not in any OU) — this is correct for the management account.

Step 3: Create member accounts

From Organizations → Add an AWS account → Create an AWS account:

┌───────┬──────────────────┬──────────────────────────────────────┬────────────┐
│ Order │   Account name   │                Email                 │ Move to OU │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 1     │ diy-gateway      │ aws-gateway@diyaccounting.co.uk      │ Workloads  │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 2     │ diy-spreadsheets │ aws-spreadsheets@diyaccounting.co.uk │ Workloads  │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 3     │ submit-ci        │ aws-ci@diyaccounting.co.uk           │ Workloads  │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 4     │ submit-prod      │ aws-prod@diyaccounting.co.uk         │ Workloads  │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 5     │ submit-backup    │ aws-backup@diyaccounting.co.uk       │ Backup     │
└───────┴──────────────────┴──────────────────────────────────────┴────────────┘

Each creation takes ~60 seconds. After each one appears, select it → Actions → Move → choose the OU.

Email note: These emails receive root account recovery. They must be real addresses you control. If you use Gmail, antony+aws-gateway@gmail.com etc. works
(Gmail ignores the + suffix). Otherwise you need 5 distinct addresses.

After all created, verify:

aws organizations list-accounts --query 'Accounts[*].[Name,Id,Status]' --output table


Record the account IDs — you'll need them for everything that follows.

Step 4: Enable IAM Identity Center

1. Go to IAM Identity Center (search for it in the console)
2. Click Enable
3. Verify region is eu-west-2 (London) — this cannot be changed after enabling
4. Identity source: keep Identity Center directory (default) — simplest for solo use

Step 5: Create your SSO user

In IAM Identity Center → Users → Add user:
- Username: antony
- Email: antony@diyaccounting.co.uk
- First/Last name as you like
- Click through — you'll get an email to set password

Step 6: Create permission sets

In IAM Identity Center → Permission sets → Create permission set:

┌─────────────────────┬──────────────────────────────────┬──────────────────┐
│   Permission set    │               Type               │ Session duration │
├─────────────────────┼──────────────────────────────────┼──────────────────┤
│ AdministratorAccess │ Predefined → AdministratorAccess │ 8 hours          │
├─────────────────────┼──────────────────────────────────┼──────────────────┤
│ ReadOnlyAccess      │ Predefined → ReadOnlyAccess      │ 4 hours          │
└─────────────────────┴──────────────────────────────────┴──────────────────┘

(You can add more later. Start with these two.)

Step 7: Assign your user to all accounts

In IAM Identity Center → AWS accounts:

1. Select all 6 accounts (887764105431 + the 5 new ones)
2. Assign users or groups → select antony
3. Select both permission sets (AdministratorAccess + ReadOnlyAccess)
4. Submit

Wait ~1 minute for propagation.

Step 8: Bookmark and test your portal

1. IAM Identity Center → Settings → copy the AWS access portal URL (format: https://d-XXXXXXXXXX.awsapps.com/start)
2. Open it in a new browser tab
3. Log in with your new SSO credentials
4. You should see all 6 accounts listed
5. Click any account → AdministratorAccess → Management console
6. Verify you land in the right account (check account ID in top-right corner)

Step 9: Set up CLI SSO profiles

aws configure sso


When prompted:
- SSO session name: diyaccounting
- SSO start URL: (paste your portal URL)
- SSO Region: eu-west-2

It opens a browser — authenticate, then pick an account/role. Repeat for each account. Or just edit ~/.aws/config directly — I'll give you the block once
you have the account IDs.

  ---
What happens next

Once you have the 6 accounts and SSO working, give me the account IDs and I can:
- Fill them into the scripts (which should be done by then)
- Update the CDK context and workflows
- Start Phase 1.1 (gateway to its own account — the simplest migration)

The whole Phase 1.0 above is roughly 30-60 minutes of clicking. The slowest part is account creation (if AWS makes you wait between creates — there's
sometimes a 1-per-minute rate limit on new orgs).
