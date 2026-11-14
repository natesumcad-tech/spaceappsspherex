import type { Metadata } from "next";
import Explorer from "@/components/explorer/Explorer";
import "./explore.css";

export const metadata: Metadata = {
  title: "Sky Explorer | Planet X & SPHEREx",
  description:
    "Step inside 3D spheres to explore real stars, constellations, planets and the Milky Way, built for the NASA Space Apps Planet X & SPHEREx challenge.",
};

export default function ExplorePage() {
  return <Explorer />;
}
