Instructions for Junie to follow:

Please keep going until all of the task spec is complete. 
Please keep running tests to make sure he work is complete and stable and when the tests pass review the 
task spec again. again to be sure all parts are implemented and if not implement them and repeat this 
process until all of the task spec is implemented. Before and after each change dry-run
the code paths to be sure you know the current state, what is expected to change and how it has changed 
and fix any problems before going on to make further changes, create tests for changes and run all relevant 
test to ensure everything passes.
Try really hard, and do what you can in parallel and keep going. If every you think you should ask if you
should continue, please just continue.

When you think you are done please perform an internal code review and fix any issues, then review from the
perspective if a person wanting to deliver all the features in `_developers/backlog` and ensure we have 
laid a good foundation for extension and if not make changes to the code and tests and repeat a cycle of
review and testing.

If you suddenly get a large batch of test failures run `./scripts/clean-tests.sh`, then test again
something seems to duplicate the tests under ./target (possibly the docker build)
but anyway clearing `./target` seems to do the trick.
