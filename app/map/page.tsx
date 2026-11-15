import PageTransition from "@/components/PageTransition";
import type { Metadata } from "next";
import StarMapApp from "@/components/starmap/StarMapApp";
import "../explore/explore.css";
import "./map.css";
import "@/components/ui/dialogue.css";

export const metadata: Metadata = {
  title: "Sky Explorer | Planet X & SPHEREx",
  description: "Fly over the whole sky: a Google Maps-style star map with a 2D and 3D view, a timeline, and waypoints you can travel to.",
};

export default function MapPage() {
  return <PageTransition><StarMapApp /></PageTransition>;
}
