const { normalizeAlert, combineNormalizedAlerts } = require("../normalize_alert.js");

it.each([
  ["no args", undefined],
  ["empty string", ""],
  ["null", null],
  ["empty object", {}],
  ["annotation is not object", { annotations: [] }],
  ["summary and description is empty", { annotations: {} }],
])("should return null if alert is malformed (%s)", (_label, input) => {
  expect(normalizeAlert(input)).toStrictEqual(null);
});

it("should normalize a generic alert", () => {
  const alert = {
    status: "resolved",
    labels: {
      mentions: "op_0:ping_1,op_0:ping_2        ,,here",
      slack_mentions: "sl1,sl2,sl1",
    },
    annotations: {
      summary: "summary",
      description: "description",
      emoji: "📈📝❌",
      url: "http://graphana.evm.example/x/operatos",
      footer_text: "footer_text",
      footer_icon_url: "icon_url",
      field_name: "field_name",
      field_value: "field_value",
    },
  };

  const result = normalizeAlert(alert);

  expect(result).toStrictEqual({
    isResolved: true,
    title: "summary",
    description: "description",
    emoji: "📈📝❌",
    url: "http://graphana.evm.example/x/operatos",
    footer: {
      text: "footer_text",
      icon_url: "icon_url",
    },
    mentions: {
      discord: new Set(["<@op_0:ping_1>", "<@op_0:ping_2>", "<@here>"]),
      slack: new Set(["<@sl1>", "<@sl2>"]),
    },
    fields: [
      {
        name: "field_name",
        value: "field_value",
      },
    ],
  });
});

it("should pick status as 'unresolved' if absent", () => {
  const alert = {
    annotations: {
      summary: "summary",
      description: "description",
    },
  };

  const result = normalizeAlert(alert);

  expect(result).toStrictEqual({
    isResolved: false,
    title: "summary",
    description: "description",
  });
});

it("should prefer 'resolved_summary'", () => {
  const alert = {
    status: "resolved",
    annotations: {
      resolved_summary: "resolved summary",
      summary: "summary",
      description: "description",
    },
  };

  const result = normalizeAlert(alert);

  expect(result).toStrictEqual({
    isResolved: true,
    title: "resolved summary",
    description: "description",
  });
});

it("should prefer 'resolved_description'", () => {
  const alert = {
    status: "resolved",
    annotations: {
      summary: "summary",
      description: "description",
      resolved_description: "resolved description",
    },
  };

  const result = normalizeAlert(alert);

  expect(result).toStrictEqual({
    isResolved: true,
    title: "summary",
    description: "resolved description",
  });
});

it("should use resolved fields even when base fields are missing", () => {
  const alert = {
    status: "resolved",
    annotations: {
      resolved_summary: "resolved summary",
      resolved_description: "resolved description",
    },
  };

  const result = normalizeAlert(alert);

  expect(result).toStrictEqual({
    isResolved: true,
    title: "resolved summary",
    description: "resolved description",
  });
});

it("should ignore resolved fields when status is not resolved", () => {
  const alert = {
    status: "firing",
    annotations: {
      summary: "summary",
      description: "description",
      resolved_summary: "resolved summary",
      resolved_description: "resolved description",
    },
  };

  const result = normalizeAlert(alert);

  expect(result).toStrictEqual({
    isResolved: false,
    title: "summary",
    description: "description",
  });
});

it("should union fields and mentions", () => {
  const alert1 = {
    isResolved: true,
    title: "summary",
    description: "description",
    fields: [
      {
        name: "field_1",
        value: "value_1",
      },
    ],
    mentions: {
      slack: new Set(["<@sl1>"]),
      discord: new Set(["<@d1>"]),
    },
  };

  const alert2 = {
    isResolved: true,
    title: "summary",
    description: "description",
    fields: [
      {
        name: "field_2",
        value: "value_2",
      },
    ],
    mentions: {
      slack: new Set(["<@sl1>", "<@sl2>"]),
      discord: new Set(["<@d2>"]),
    },
  };

  const result = combineNormalizedAlerts([alert1, alert2]);

  expect(result).toStrictEqual({
    isResolved: true,
    title: "summary",
    description: "description",
    fields: [
      {
        name: "field_1",
        value: "value_1",
      },
      {
        name: "field_2",
        value: "value_2",
      },
    ],
    mentions: {
      slack: new Set(["<@sl1>", "<@sl2>"]),
      discord: new Set(["<@d1>", "<@d2>"]),
    },
  });
});

it("should union discord mentions without slack mentions", () => {
  const alert1 = {
    isResolved: true,
    title: "summary",
    description: "description",
    mentions: {
      discord: new Set(["<@d1>"]),
    },
  };

  const alert2 = {
    isResolved: true,
    title: "summary",
    description: "description",
    mentions: {
      discord: new Set(["<@d2>"]),
    },
  };

  const result = combineNormalizedAlerts([alert1, alert2]);

  expect(result).toStrictEqual({
    isResolved: true,
    title: "summary",
    description: "description",
    mentions: {
      discord: new Set(["<@d1>", "<@d2>"]),
    },
  });
});

it("should union slack mentions without discord mentions", () => {
  const alert1 = {
    isResolved: false,
    title: "summary",
    description: "description",
    mentions: {
      slack: new Set(["<@sl1>"]),
    },
  };

  const alert2 = {
    isResolved: false,
    title: "summary",
    description: "description",
    mentions: {
      slack: new Set(["<@sl2>"]),
    },
  };

  const result = combineNormalizedAlerts([alert1, alert2]);

  expect(result).toStrictEqual({
    isResolved: false,
    title: "summary",
    description: "description",
    mentions: {
      slack: new Set(["<@sl1>", "<@sl2>"]),
    },
  });
});

it("should drop empty fields and mentions on union", () => {
  const alert = {
    isResolved: false,
    title: "summary",
    description: "description",
    fields: [],
    mentions: {
      slack: new Set(),
    },
  };

  const result = combineNormalizedAlerts([alert]);

  expect(result).toStrictEqual({
    isResolved: false,
    title: "summary",
    description: "description",
  });
});

it("should return null when union input is empty", () => {
  expect(combineNormalizedAlerts([])).toBeNull();
});
