// And the dynamo db records will have a ttl 1 month after bundle expiry and also have a grace period where the APIs permit traffic
// And There is a script to add a salted hash of the user sub (email?) to a directory of users for "test" > bundle-grants/hashofsub.txt
// And the bundle grants are allocated during deployment
// And sessions can time and and refresh their tokens
