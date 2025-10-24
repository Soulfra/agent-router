# Nix environment configuration for Replit
#
# This defines what packages/tools are available in the Replit environment
# Automatically installed when you fork the project

{ pkgs }: {
  deps = [
    # Node.js 18 (LTS)
    pkgs.nodejs-18_x

    # PostgreSQL (for database)
    pkgs.postgresql

    # FFmpeg (for video/audio processing)
    pkgs.ffmpeg

    # Sharp dependencies (image processing)
    pkgs.vips
    pkgs.pkg-config

    # Git (for version control)
    pkgs.git

    # Useful CLI tools
    pkgs.curl
    pkgs.wget
    pkgs.jq

    # Python (for some scripts)
    pkgs.python3
  ];

  # Environment variables
  env = {
    # Use Replit's built-in PostgreSQL
    PGHOST = "127.0.0.1";
    PGPORT = "5432";
    PGDATABASE = "calos";
    PGUSER = "postgres";

    # Node environment
    NODE_ENV = "development";
    PORT = "5001";
  };
}
