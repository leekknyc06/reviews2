import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({ origin: "*" }));

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

let cachedReviews = [];
let lastFetch = 0;
const CACHE_TIME = 60 * 1000;

function getDiscordAvatarUrl(author) {
  if (!author || !author.id || !author.avatar) return null;

  const extension = author.avatar.startsWith("a_") ? "gif" : "png";

  return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${extension}?size=128`;
}

function cleanDiscordMessage(content) {
  if (!content) return "";

  return content
    .replace(/<@!?\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/<@&\d+>/g, "")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/@\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getStarsFromMessage(content) {
  const ratingMatch = content.match(/(\d+(?:\.\d+)?)\s*\/\s*(10|100)/i);

  if (!ratingMatch) return 5;

  const score = Number(ratingMatch[1]);
  const maxScore = Number(ratingMatch[2]);

  if (Number.isNaN(score) || Number.isNaN(maxScore)) return 5;

  const stars = Math.round((score / maxScore) * 5);

  return Math.min(Math.max(stars, 1), 5);
}

function isValidReviewMessage(message) {
  if (!message) return false;
  if (message.author?.bot) return false;

  const cleanText = cleanDiscordMessage(message.content);

  if (!cleanText) return false;
  if (cleanText.length < 8) return false;

  return true;
}

function parseReviewMessage(message) {
  const reviewText = cleanDiscordMessage(message.content);

  return {
    name:
      message.author?.global_name ||
      message.author?.username ||
      "Discord User",
    role: "Discord Review",
    stars: getStarsFromMessage(reviewText),
    review: reviewText,
    avatar: getDiscordAvatarUrl(message.author),
    timestamp: message.timestamp
  };
}

app.get("/api/reviews", async (req, res) => {
  try {
    const now = Date.now();

    if (now - lastFetch < CACHE_TIME && cachedReviews.length > 0) {
      return res.json(cachedReviews);
    }

    if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
      return res.status(500).json({
        error: "Missing Discord bot token or Discord channel ID."
      });
    }

    const discordUrl = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=25`;

    const response = await fetch(discordUrl, {
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        Accept: "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to fetch Discord messages.",
        details: data
      });
    }

    const reviews = data
      .filter(isValidReviewMessage)
      .map(parseReviewMessage)
      .slice(0, 6);

    cachedReviews = reviews;
    lastFetch = now;

    return res.json(reviews);
  } catch (error) {
    return res.status(500).json({
      error: "Server error while loading Discord reviews."
    });
  }
});

app.get("/api/debug", async (req, res) => {
  try {
    const discordUrl = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=10`;

    const response = await fetch(discordUrl, {
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        Accept: "application/json"
      }
    });

    const data = await response.json();

    return res.json({
      status: response.status,
      message_count: Array.isArray(data) ? data.length : 0,
      messages: Array.isArray(data)
        ? data.map((msg) => ({
            author: msg.author?.username,
            content: msg.content,
            cleaned: cleanDiscordMessage(msg.content),
            timestamp: msg.timestamp
          }))
        : data
    });
  } catch (error) {
    return res.status(500).json({
      error: "Debug failed."
    });
  }
});

app.get("/", (req, res) => {
  res.send("Socnfdnt Reviews API is running.");
});

app.listen(PORT, () => {
  console.log(`Socnfdnt Reviews API running on port ${PORT}`);
});