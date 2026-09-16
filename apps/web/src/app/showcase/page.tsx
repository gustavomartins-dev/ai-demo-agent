import type { Metadata } from "next";
import { ShowcaseExperience } from "./showcase-experience";

export const metadata: Metadata = {
  title: "DemoAgent — Evidence-first project demos",
  description: "A public, read-only walkthrough of the DemoAgent launch pipeline.",
};

export default function ShowcasePage() {
  return <ShowcaseExperience />;
}
