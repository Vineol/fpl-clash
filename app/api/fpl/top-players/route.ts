
import { NextResponse } from "next/server";

type FPLPlayer = {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
  total_points: number;
  now_cost: number;
  photo: string;
};

type FPLTeam = {
  id: number;
  name: string;
  short_name: string;
};

type FPLBootstrap = {
  elements: FPLPlayer[];
  teams: FPLTeam[];
  element_types: { id: number; singular_name_short: string }[];
};

export async function GET() {
  try {
    const response = await fetch(
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      {
        cache: "no-store",
        headers: { "User-Agent": "FPL-Clash/1.0" },
      }
    );

    if (!response.ok) {
      throw new Error(`Official FPL API returned ${response.status}`);
    }

    const data: FPLBootstrap = await response.json();

    const teams = new Map(data.teams.map((team) => [team.id, team]));

    const positions = new Map(
      data.element_types.map((position) => [
        position.id,
        position.singular_name_short,
      ])
    );

    const players = data.elements
      .map((player) => ({
        id: player.id,
        name: player.web_name,
        fullName: `${player.first_name} ${player.second_name}`,
        club: teams.get(player.team)?.name ?? "Unknown",
        clubCode: teams.get(player.team)?.short_name ?? "",
        position: positions.get(player.element_type) ?? "",
        points: player.total_points,
        price: (player.now_cost / 10).toFixed(1),
        photo: player.photo,
      }))
      .sort((a, b) => b.points - a.points);

    const bestByPosition = (position: string) =>
      players.find((player) => player.position === position) ?? null;

    const result = {
      players: [
        {
          category: "Best Goalkeeper",
          shortLabel: "GKP",
          player: bestByPosition("GKP"),
        },
        {
          category: "Best Defender",
          shortLabel: "DEF",
          player: bestByPosition("DEF"),
        },
        {
          category: "Best Midfielder",
          shortLabel: "MID",
          player: bestByPosition("MID"),
        },
        {
          category: "Best Forward",
          shortLabel: "FWD",
          player: bestByPosition("FWD"),
        },
        {
          category: "Overall No. 1",
          shortLabel: "TOP PLAYER",
          player: players[0] ?? null,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Top FPL players error:", error);

    return NextResponse.json(
      { error: "Unable to load the latest FPL player rankings." },
      { status: 502 }
    );
  }
}
