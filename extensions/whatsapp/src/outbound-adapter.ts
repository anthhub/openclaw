import {
  type ChannelOutboundAdapter,
  createAttachedChannelResultAdapter,
  createEmptyChannelResult,
} from "openclaw/plugin-sdk/channel-send-result";
import { resolveOutboundSendDep } from "openclaw/plugin-sdk/outbound-runtime";
import {
  resolveSendableOutboundReplyParts,
  sendTextMediaPayload,
} from "openclaw/plugin-sdk/reply-payload";
import { chunkText } from "openclaw/plugin-sdk/reply-runtime";
import { shouldLogVerbose } from "openclaw/plugin-sdk/runtime-env";
import { toWhatsappJid } from "openclaw/plugin-sdk/text-runtime";
import type { QuotedMessageKey } from "./active-listener.js";
import { resolveWhatsAppOutboundTarget } from "./runtime-api.js";
import { sendMessageWhatsApp, sendPollWhatsApp } from "./send.js";

function buildQuotedMessageKeyFromReplyToId(
  replyToId: string | null | undefined,
  to: string,
): QuotedMessageKey | undefined {
  const id = replyToId?.trim();
  if (!id) return undefined;
  return { id, remoteJid: toWhatsappJid(to), fromMe: false };
}

function trimLeadingWhitespace(text: string | undefined): string {
  return text?.trimStart() ?? "";
}

export const whatsappOutbound: ChannelOutboundAdapter = {
  deliveryMode: "gateway",
  chunker: chunkText,
  chunkerMode: "text",
  textChunkLimit: 4000,
  pollMaxOptions: 12,
  resolveTarget: ({ to, allowFrom, mode }) =>
    resolveWhatsAppOutboundTarget({ to, allowFrom, mode }),
  sendPayload: async (ctx) => {
    const text = trimLeadingWhitespace(ctx.payload.text);
    const hasMedia = resolveSendableOutboundReplyParts(ctx.payload).hasMedia;
    if (!text && !hasMedia) {
      return createEmptyChannelResult("whatsapp");
    }
    return await sendTextMediaPayload({
      channel: "whatsapp",
      ctx: {
        ...ctx,
        payload: {
          ...ctx.payload,
          text,
        },
      },
      adapter: whatsappOutbound,
    });
  },
  ...createAttachedChannelResultAdapter({
    channel: "whatsapp",
    sendText: async ({ cfg, to, text, accountId, deps, gifPlayback, replyToId }) => {
      const normalizedText = trimLeadingWhitespace(text);
      if (!normalizedText) {
        return createEmptyChannelResult("whatsapp");
      }
      const send =
        resolveOutboundSendDep<typeof import("./send.js").sendMessageWhatsApp>(deps, "whatsapp") ??
        (await import("./send.js")).sendMessageWhatsApp;
      return await send(to, normalizedText, {
        verbose: false,
        cfg,
        accountId: accountId ?? undefined,
        gifPlayback,
        quotedMessageKey: buildQuotedMessageKeyFromReplyToId(replyToId, to),
      });
    },
    sendMedia: async ({
      cfg,
      to,
      text,
      mediaUrl,
      mediaLocalRoots,
      accountId,
      deps,
      gifPlayback,
      replyToId,
    }) => {
      const normalizedText = trimLeadingWhitespace(text);
      const send =
        resolveOutboundSendDep<typeof import("./send.js").sendMessageWhatsApp>(deps, "whatsapp") ??
        (await import("./send.js")).sendMessageWhatsApp;
      return await send(to, normalizedText, {
        verbose: false,
        cfg,
        mediaUrl,
        mediaLocalRoots,
        accountId: accountId ?? undefined,
        gifPlayback,
        quotedMessageKey: buildQuotedMessageKeyFromReplyToId(replyToId, to),
      });
    },
    sendPoll: async ({ cfg, to, poll, accountId }) =>
      await sendPollWhatsApp(to, poll, {
        verbose: shouldLogVerbose(),
        accountId: accountId ?? undefined,
        cfg,
      }),
  }),
};
