// app/page.js

"use client";

import graphData from "./data.json";
import FunctionsGraph from "./components/FunctionsGraph";

export default function Page() {
  return <FunctionsGraph data={graphData} />;
}
