DIY Accounting Submit site navigation
-------------------------------------
-------------------------------------

Pages:

Home [Login enabled] [hamburger menu enabled]
Login [Login enabled] [hamburger menu enabled]
Bundles [Login enabled] [hamburger menu enabled]
Activities [Login enabled] [hamburger menu enabled]
VAT Return Submission
Test Demo Submission

Hamburger menu: [Home, Bundles, Activities]
Login menu: [Login, Logout] (Login/Logout always takes you to home page, 
    no auth processing for landing anywhere else.)

Journey 1: Existing user submits VAT
====================================

Home
Login
View available activities
Click VAT Return submission
Submit VAT Return
Logout and view home page

Journey 2: New customer signing up and adding a bundle
======================================================

Home
View available activities (none shown)
Click link to bundles page (requests login to add bundle)
Login via button and return to bundles page now with bundles to add shown (HMRC Test API + Test Demo Bundle)
Add HMRC Test API Bundle
View available activities (Submit VAT shown)
Logout and view home page
Login
View available activities (Submit VAT shown)
Logout and view home page

Journey 3: New customer signing up and denied adding a bundle
=============================================================

Home
Click hamburger menu to Add bundles page (requests login to add bundle)
Login via button and return to bundles page now with bundles to add shown (Only test demo bundle)
Only test demo bundle available to add
Add Test Demo Bundle
Click hamburger menu to Add bundles page
No bundles available to add

Journey 4: Hamburger menu and back navigation
=============================================

Home
Bundles via hamburger menu
Back to home via back
Activities via hamburger menu
Home via hamburger menu
Back to Activities via back
Back to home via back

