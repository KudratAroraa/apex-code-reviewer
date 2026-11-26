---
description: Review Salesforce Apex classes and triggers for governor limit, security and quality problems
argument-hint: "[folder or file, default: whole project]"
---

Review the Salesforce Apex code in `$ARGUMENTS` using the apex-review skill. If no folder or file was given, review the whole project.

Follow the skill's method: list the files, scan every file with the apex tools, read the code to confirm each finding and catch problems the scanner cannot see, then write `apex-review.json` and `apex-review.md` and give me a short summary.
