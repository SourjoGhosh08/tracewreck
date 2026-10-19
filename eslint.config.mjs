import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      // These effects intentionally synchronize UI state with API requests.
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default config;
