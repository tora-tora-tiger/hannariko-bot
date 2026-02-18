import { Events, Message } from "discord.js";
import { HannarikoBot } from "../main";
import { DeathCounterDatabase } from "../database/death-counter";

export class DeathCounter {
  private readonly database: DeathCounterDatabase;
  private readonly pattern = /(?:し|死|シ|ｼ|ﾀﾋ|shi|si)(?:ね|ネ|ﾈ|ne)/gi;

  constructor(private readonly bot: HannarikoBot) {
    this.database = new DeathCounterDatabase();
  }

  async initialize(): Promise<void> {
    try {
      await this.database.initialize();
      this.bot.client.on(Events.MessageCreate, async (message) => {
        await this.handleMessage(message);
      });
    } catch (error) {
      console.error("Failed to initialize death counter:", error);
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) {
      return;
    }

    const matches = message.content.match(this.pattern);
    if (!matches || matches.length === 0) {
      return;
    }

    const increment = matches.length;

    try {
      const totalCount = await this.database.incrementUserCount(
        message.author.id,
        increment
      );
      const displayName = message.member?.displayName ?? message.author.username;
      await message.reply(
        `💢💢💢 絶対に禁止されています！！！ 💢💢💢\nそんな言葉を使うなんてとんでもない！😡\n死ねカウンター: ${totalCount}（今回 ${increment} 回）。`
      );
    } catch (error) {
      console.error("Failed to update death counter:", error);
    }
  }
}
