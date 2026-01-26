const { convertMarkdownToSlack } = require("../slack_helpers");

test("convertMarkdownToSlack keeps bracketed links intact", () => {
  const input =
    "\nCSM Operator 343 - Violated duty: attester | Validators: [[1255982](http://mainnet.beaconcha.in/validator/1255982)]\n\nslot: [2099408](https://mainnet.beaconcha.in/slot/2099408)";
  const expected =
    "\nCSM Operator 343 - Violated duty: attester | Validators: [<http://mainnet.beaconcha.in/validator/1255982|1255982>]\n\nslot: <https://mainnet.beaconcha.in/slot/2099408|2099408>";

  expect(convertMarkdownToSlack(input)).toBe(expected);
});
