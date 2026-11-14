import type { Metadata } from "next";
import StarMapApp from "@/components/starmap/StarMapApp";
import "./map.css";

export const metadata: Metadata = {
  title: "Star Map | Planet X & SPHEREx",
  description: "Fly over the whole sky: a Google Maps-style star map with a 2D and 3D view, a timeline, and waypoints you can travel to.",
};

export default function MapPage() {
  return <StarMapApp />;
}
