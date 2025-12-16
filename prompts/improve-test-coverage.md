Please improve the test coverage for some of these by adding new tests. Favour deep tests that
test a high level function (system tests which spin uo services, or just really deep unit tests
with mocks when it gets messy) and in doing so exercise useful inners, where there is some complicated
inner code that isn't tested consider a separated test file.

To check progress with coverage run npm run test:coverage. That command maps to this in package.json:
"test:coverage": "npx vitest --coverage --run app/unit-tests/*.test.js app/unit-tests/*/*.test.js app/system-tests/*.test.js",
(so those are the places you can but tests to improve this.)
Favour duplication and a narrative flow to the tests over heavy abstraction or fancy spying.
Only tests the important stuff, don't test logging output (favouring verbose logging in tests).
Check the style of the tests that test hugh level lambdas as the kind of stuff I'm going for.
