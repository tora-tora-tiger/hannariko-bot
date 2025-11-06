import {
  CacheType,
  ChatInputCommandInteraction,
  DiscordAPIError,
  Events,
  Interaction,
  SharedSlashCommand,
  SlashCommandBuilder,
} from "discord.js";
import { HannarikoBot } from "../main";
import { CommandBase } from "./command-base";

export class TalkCommand extends CommandBase {
  private conversationHistory: {
    topic: string;
    messages: { speaker: string; content: string }[];
  } | null = null;

  constructor(protected readonly bot: HannarikoBot) {
    super(bot);
    this.register();
  }

  async register() {
    const { client } = this.bot;

    client.on(Events.InteractionCreate, async (interaction) =>
      this.handleInteraction(interaction)
    );
  }

  getSlashCommand(): SharedSlashCommand {
    return new SlashCommandBuilder()
      .setName("talk")
      .setDescription("AIによる太郎と花子の対話を開始")
      .addStringOption((option) =>
        option
          .setName("お題")
          .setDescription("対話のお題（例：「猫と犬はどちらが良いペット？」）")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("ターン数")
          .setDescription("対話のターン数（デフォルト: 3）")
          .setMinValue(1)
          .setMaxValue(10)
      )
      .addStringOption((option) =>
        option
          .setName("太郎の性格")
          .setDescription(
            "太郎の性格設定（デフォルト: ユニークなアイデアを話す人）"
          )
      )
      .addStringOption((option) =>
        option
          .setName("花子の性格")
          .setDescription(
            "花子の性格設定（デフォルト: 太郎に否定的な意見を述べる人）"
          )
      );
  }

  async handleInteraction(interaction: Interaction<CacheType>) {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    if (commandName === "talk") {
      const chatInteraction: ChatInputCommandInteraction = interaction;
      const topic = chatInteraction.options.getString("お題", true);
      const turns = chatInteraction.options.getInteger("ターン数") || 3;
      const taroPersonality = chatInteraction.options.getString("太郎の性格");
      const hanakoPersonality =
        chatInteraction.options.getString("花子の性格");

      try {
        // 新しい対話を開始
        this.conversationHistory = {
          topic,
          messages: [],
        };

        // 最初のメッセージを送信
        await chatInteraction.reply({
          content: `**お題: ${topic}**\n\n対話を開始します...`,
        });

        // editReply で 10008 が発生した場合に利用するフォローアップメッセージの ID
        let fallbackMessageId: string | null = null;

        const updateReply = async (content: string) => {
          try {
            if (fallbackMessageId) {
              await chatInteraction.webhook.editMessage(fallbackMessageId, {
                content,
              });
            } else {
              await chatInteraction.editReply({ content });
            }
          } catch (error) {
            if (
              error instanceof DiscordAPIError &&
              error.code === 10008
            ) {
              console.warn(
                "[TalkCommand] Original reply was missing. Sending a follow-up message instead."
              );
              const followUpMessage = await chatInteraction.followUp({
                content,
              });
              fallbackMessageId = followUpMessage.id;
            } else {
              throw error;
            }
          }
        };

        // メッセージ内容を保持する変数
        let messageContent = `**お題: ${topic}**\n\n`;

        // 対話の進行
        for (let i = 0; i < turns; i++) {
          // 太郎の発言を生成
          const taroMessage = await this.generateMessage(
            "太郎",
            taroPersonality
          );
          messageContent += `**太郎：** ${taroMessage}\n\n`;

          // メッセージを更新
          await updateReply(messageContent);

          // 花子の発言を生成
          const hanakoMessage = await this.generateMessage(
            "花子",
            hanakoPersonality
          );
          messageContent += `**花子：** ${hanakoMessage}\n\n`;

          // メッセージを更新
          await updateReply(messageContent);
        }

        // 対話終了メッセージ
        messageContent += "対話が終了しました。";
        await updateReply(messageContent);
      } catch (error) {
        console.error("/talk コマンド実行中にエラーが発生しました:", error);
        if (chatInteraction.deferred || chatInteraction.replied) {
          await chatInteraction
            .followUp({
              content:
                "会話の更新中にエラーが発生しました。もう一度お試しください。",
              ephemeral: true,
            })
            .catch((followUpError) => {
              console.error(
                "/talk コマンドのエラーメッセージ送信に失敗しました:",
                followUpError
              );
            });
        } else {
          await chatInteraction
            .reply({
              content:
                "会話の開始中にエラーが発生しました。もう一度お試しください。",
              ephemeral: true,
            })
            .catch((replyError) => {
              console.error(
                "/talk コマンドのエラーメッセージ返信に失敗しました:",
                replyError
              );
            });
        }
      }
    }
  }

  private async generateMessage(
    speaker: string,
    personality?: string | null
  ): Promise<string> {
    if (!this.conversationHistory) return "（会話履歴が見つかりません）";

    const { gemini } = this.bot;
    const { topic, messages } = this.conversationHistory;

    // 現在の会話履歴を文字列に変換
    const historyText = messages
      .map((m) => `${m.speaker}：${m.content}`)
      .join("\n");

    // プロンプトの作成
    let prompt = "";

    if (speaker === "太郎") {
      // デフォルトの太郎の性格
      const defaultTaroPersonality = `
- 与えられたお題「${topic}」について、ユニークで独創的なアイデアや考えを述べる
- 斬新な視点や意外な切り口を提示する
- 常に前向きでポジティブな態度を保つ
- 花子の否定的な意見に対しても、建設的に対応する
- 一人称は「僕」を使う
- 短く簡潔に（100字以内）`;

      // カスタム性格があればそれを使用、なければデフォルト
      const personalityDescription = personality || defaultTaroPersonality;

      prompt = `
あなたは太郎という名前の人物として返答してください。
以下の条件に従って返答してください：
${personalityDescription}

これまでの会話：
${historyText}

太郎の次の発言を日本語で書いてください。「太郎：」などのプレフィックスは不要です。`;
    } else {
      // デフォルトの花子の性格
      const defaultHanakoPersonality = `
- 与えられたお題「${topic}」について、太郎の意見に対して批判的・否定的な立場をとる
- 太郎のアイデアの問題点や欠点を指摘する
- 現実的な視点から意見を述べる
- 完全に否定するわけではなく、建設的な批判を行う
- 一人称は「私」を使う
- 短く簡潔に（100字以内）`;

      // カスタム性格があればそれを使用、なければデフォルト
      const personalityDescription = personality || defaultHanakoPersonality;

      prompt = `
あなたは花子という名前の人物として返答してください。
以下の条件に従って返答してください：
${personalityDescription}

これまでの会話：
${historyText}

花子の次の発言を日本語で書いてください。「花子：」などのプレフィックスは不要です。`;
    }

    try {
      // AI応答の生成
      const response = await gemini.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });

      const messageContent = response.text?.trim() || "（応答なし）";

      // 会話履歴に追加
      this.conversationHistory.messages.push({
        speaker,
        content: messageContent,
      });

      return messageContent;
    } catch (error) {
      console.error(`${speaker}の発言生成中にエラーが発生しました:`, error);
      return `（${speaker}の発言生成中にエラーが発生しました）`;
    }
  }
}
