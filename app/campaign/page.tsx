import PageTransition from "@/components/PageTransition";
import type { Metadata } from "next";
import Campaign from "@/components/campaign/Campaign";
import "../explore/explore.css";
import "../map/map.css";
import "./campaign.css";

export const metadata: Metadata = {
  title: "Campaign | Planet X & SPHEREx",
  description: "A guided, game-style tour of the infrared sky: meet NASA's SPHEREx telescope and the Planet X challenge, one landmark at a time.",
};

export default function CampaignPage() {
  return <PageTransition><Campaign /></PageTransition>;
}
