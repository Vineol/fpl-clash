
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^[1-9]\d*$/.test(id)) {
    return NextResponse.json(
      { error: "Please provide a valid numeric FPL Team ID." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://fantasy.premierleague.com/api/entry/${id}/`,
      { cache: "no-store" }
    );

    if (response.status === 404) {
      return NextResponse.json(
        { error: "No FPL team was found with this ID." },
        { status: 404 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "FPL is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    const entry = await response.json();

    return NextResponse.json({
      valid: true,
      teamId: entry.id,
      teamName: entry.name,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to FPL. Please try again later." },
      { status: 502 }
    );
  }
}
