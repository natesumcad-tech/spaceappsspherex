import Link from "next/link";
import "./site-tabs.css";

export default function SiteTabs({ active }: { active: "home" | "explorer" }) {
  return (
    <nav className="site-tabs" aria-label="Main navigation">
      <Link transitionTypes={["site-navigation"]} href="/" aria-current={active === "home" ? "page" : undefined}>Home</Link>
      <Link transitionTypes={["site-navigation"]} href="/map" aria-current={active === "explorer" ? "page" : undefined}>Sky Explorer</Link>
    </nav>
  );
}
