#!/usr/bin/env bash
set -eux

VALIDATOR_PID=""

function cleanup() {
    if [ -n "$VALIDATOR_PID" ]; then
        kill "$VALIDATOR_PID" 2>/dev/null || true
        wait "$VALIDATOR_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT

function check_validator() {
    curl -s http://127.0.0.1:8899 -X POST \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
        2>/dev/null | grep -q '"ok"'
}

function start_validator() {
    if check_validator; then
        echo "Using existing validator on port 8899"
        return 0
    fi
    solana-test-validator --reset >/dev/null 2>&1 &
    VALIDATOR_PID=$!

    local retries=30
    while [ $retries -gt 0 ]; do
        if check_validator; then
            return 0
        fi
        retries=$((retries - 1))
        sleep 1
    done
    echo "Validator failed to start"
    exit 1
}

function test_project() {
    ./test/e2e/generate.cjs $1
    cd test/e2e/$1
    pnpm install && pnpm build && pnpm test
    cd ../../..
}

start_validator
test_project anchor
test_project system
test_project memo
test_project token
test_project dummy
