#!/bin/bash
echo 'S3 Chat: An interactive chat session using Amazon S3 as a message broker.'
echo 'Setup:'
echo '1. Create an S3 bucket (if not already created):  aws s3 mb s3://your-chat-bucket'
echo '2. Enable versioning on the bucket:               aws s3api put-bucket-versioning --bucket your-chat-bucket --versioning-configuration Status=Enabled'
echo '3. Create a chat topic (prefix):                  aws s3api put-object --bucket your-chat-bucket --key chat/'
echo 'Usage:'
echo '1. Set BUCKET below to your S3 bucket name.'
echo '2. Optionally set the environment variable S3CHAT_USER to your preferred username (default is the output of whoami).'
echo '3. Run this script in as many bash terminals as you like.'
echo '4. Type your message at the prompt and press Enter. All participants will see every published message.'
echo '5. Type /exit to quit.'
BUCKET="your-s3-ootb-broker-bucket"
TOPIC="chat"
LAST_MODIFIED_FILE="/tmp/s3chat_last_modified_$$.txt"
if [ ! -f "$LAST_MODIFIED_FILE" ]; then
    echo "1970-01-01T00:00:00Z" > "$LAST_MODIFIED_FILE"
fi
publish_message() {
    local msg="$1"
    local user="${S3CHAT_USER:-$(whoami)}"
    local timestamp
    timestamp=$(date -Iseconds)
    local filename="msg-$(date +%s%N).json"
    echo "{\"user\": \"${user}\", \"message\": \"${msg}\", \"timestamp\": \"${timestamp}\"}" > "$filename"
    aws s3 cp "$filename" "s3://${BUCKET}/${TOPIC}/${filename}" > /dev/null 2>&1
    rm "$filename"
}
poll_messages() {
    while true; do
        last_modified=$(cat "$LAST_MODIFIED_FILE")
        new_msgs=$(aws s3api list-object-versions --bucket "$BUCKET" --prefix "${TOPIC}/" \
          --query "sort_by(Versions[?LastModified > \`${last_modified}\`], &LastModified)" --output json)
        echo "$new_msgs" | jq -c '.[]' | while read -r item; do
            key=$(echo "$item" | jq -r '.Key')
            version=$(echo "$item" | jq -r '.VersionId')
            msg_timestamp=$(echo "$item" | jq -r '.LastModified')
            aws s3api get-object --bucket "$BUCKET" --key "$key" --version-id "$version" /tmp/s3chat_msg.json > /dev/null 2>&1
            if [ -s /tmp/s3chat_msg.json ]; then
                # Extract fields and display in a friendly format.
                user_field=$(jq -r '.user' /tmp/s3chat_msg.json)
                message_field=$(jq -r '.message' /tmp/s3chat_msg.json)
                timestamp_field=$(jq -r '.timestamp' /tmp/s3chat_msg.json)
                echo -e "\n[${timestamp_field}] ${user_field}: ${message_field}"
            fi
            echo "$msg_timestamp" > "$LAST_MODIFIED_FILE"
            rm -f /tmp/s3chat_msg.json
        done
        sleep 1
    done
}
poll_messages &
POLL_PID=$!
trap "kill $POLL_PID; exit" SIGINT SIGTERM
echo "Welcome to S3 Chat! Type your message and press Enter. Type /exit to quit."
while true; do
    read -r -p "> " user_input
    if [ "$user_input" = "/exit" ]; then
        kill $POLL_PID
        exit 0
    fi
    publish_message "$user_input"
done
