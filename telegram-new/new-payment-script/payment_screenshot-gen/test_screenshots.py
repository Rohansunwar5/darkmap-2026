"""
Use Case:
This script acts as a functional test for the payment screenshot generation module. 
It verifies that both Apple and Android templates correctly render text overlays 
(such as amount and recipient address) by saving sample outputs to the 'screenshots' directory.
It tests specific edge cases like ENS resolution for Ethereum addresses, shortening of BTC 
addresses, and proper validation error handling for invalid addresses.
"""
import payment
import os

# Ensure the output directory exists
if not os.path.exists("screenshots"):
    os.makedirs("screenshots")

# Test Case 1: Apple template with an Ethereum address that resolves to an ENS name.
# It should display 'vitalik.eth' instead of the raw address.
try:
    img = payment.generate_apple_screenshot(
        amount="500",
        to_address="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", # Vitalik's address -> vitalik.eth
    )
    img.save("screenshots/test_apple.png")
    print("Successfully generated apple screenshot (vitalik.eth)")
except Exception as e:
    print(f"Failed for apple: {e}")

# Test Case 2: Android template with an Ethereum address that does not have an ENS name.
# It should shorten the address in the center (e.g., 0x3a1A...9774).
try:
    img = payment.generate_android_screenshot(
        amount="2",
        to_address="0x3a1A02794dFa52f2F28e42ADe8373De5C5699774", # No ENS -> 0x3a1A...9774
    )
    img.save("screenshots/test_android.png")
    print("Successfully generated android screenshot (fallback address)")
except Exception as e:
    print(f"Failed for android: {e}")

# Test Case 3: Android template with a Bitcoin address.
# It should identify it as non-Ethereum and shorten it (e.g., 1DDKcH...hd6m).
try:
    img = payment.generate_android_screenshot(
        amount="3",
        to_address="1DDKcHaYUGDQvoKMfqSCJ4YkjBo1mnhd6m", # BTC address -> 1DDKcH...hd6m
    )
    img.save("screenshots/test_btc.png")
    print("Successfully generated BTC screenshot (shortened format)")
except Exception as e:
    print(f"Failed for BTC: {e}")

# Test Case 4: Exception handling for invalid or unrecognized addresses.
# It should throw a ValueError rather than attempting to generate an image.
try:
    # Test invalid address
    payment.generate_apple_screenshot(amount="10", to_address="invalid_wallet")
    print("Failed: Invalid address did not raise an exception")
except ValueError as e:
    print(f"Successfully caught invalid address: {e}")
