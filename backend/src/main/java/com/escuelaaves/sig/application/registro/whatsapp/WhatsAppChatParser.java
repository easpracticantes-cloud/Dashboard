package com.escuelaaves.sig.application.registro.whatsapp;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoField;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parser de exportaciones reales de WhatsApp (Android / iOS).
 * No interpreta cotizaciones: solo cronología de mensajes.
 */
public final class WhatsAppChatParser {

    private static final Pattern ANDROID = Pattern.compile(
            "^(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}),?\\s+(\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*[ap]\\.\\s*m\\.|\\s*[ap]m)?)\\s+-\\s+(.*)$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern IOS = Pattern.compile(
            "^\\[(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}),\\s+(\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*[ap]\\.\\s*m\\.|\\s*[ap]m)?)\\]\\s+(.*)$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SYSTEM = Pattern.compile(
            "(omitted|omitido|encrypted|cifrado|messages and calls are end-to-end|los mensajes y las llamadas)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern QUOTE = Pattern.compile(
            "(cotiz|presupuesto|valor|precio|cop\\s|\\$\\s*\\d|usd|por persona|pp\\b)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern PHONE = Pattern.compile("(\\+?\\d[\\d\\s\\-]{7,}\\d)");

    private WhatsAppChatParser() {
    }

    public record WhatsAppMessage(
            LocalDateTime at,
            String sender,
            String text,
            boolean system,
            boolean quoteLike
    ) {
    }

    public record ParsedWhatsAppChat(
            String title,
            String inferredPhone,
            List<WhatsAppMessage> messages
    ) {
        public List<WhatsAppMessage> chronological() {
            return messages;
        }
    }

    public static ParsedWhatsAppChat parse(String filename, String rawText) {
        String text = rawText == null ? "" : rawText.replace("\u200e", "").replace("\r\n", "\n");
        List<WhatsAppMessage> messages = new ArrayList<>();
        String currentSender = null;
        LocalDateTime currentAt = null;
        StringBuilder buf = new StringBuilder();

        for (String line : text.split("\n", -1)) {
            Matcher head = matchHeader(line);
            if (head != null) {
                flush(messages, currentAt, currentSender, buf);
                currentAt = parseDate(head.group(1), head.group(2));
                String rest = head.group(3) == null ? "" : head.group(3).trim();
                int colon = rest.indexOf(": ");
                if (colon > 0) {
                    currentSender = rest.substring(0, colon).trim();
                    buf = new StringBuilder(rest.substring(colon + 2));
                } else {
                    currentSender = rest;
                    buf = new StringBuilder();
                }
            } else if (!line.isBlank()) {
                if (!buf.isEmpty()) {
                    buf.append('\n');
                }
                buf.append(line);
            }
        }
        flush(messages, currentAt, currentSender, buf);

        String phone = inferPhone(filename, messages);
        String title = filename == null ? "chat" : filename.replaceFirst("(?i)\\.(txt|zip)$", "");
        return new ParsedWhatsAppChat(title, phone, List.copyOf(messages));
    }

    public static List<WhatsAppMessage> compactForModel(List<WhatsAppMessage> messages, int maxMessages) {
        if (messages == null || messages.size() <= maxMessages) {
            return messages == null ? List.of() : messages;
        }
        List<WhatsAppMessage> quotes = messages.stream().filter(WhatsAppMessage::quoteLike).toList();
        int head = Math.min(25, messages.size());
        int tail = Math.min(40, messages.size());
        List<WhatsAppMessage> out = new ArrayList<>();
        out.addAll(messages.subList(0, head));
        for (WhatsAppMessage q : quotes) {
            if (!out.contains(q)) {
                out.add(q);
            }
        }
        List<WhatsAppMessage> last = messages.subList(messages.size() - tail, messages.size());
        for (WhatsAppMessage m : last) {
            if (!out.contains(m)) {
                out.add(m);
            }
        }
        out.sort((a, b) -> {
            if (a.at() == null && b.at() == null) return 0;
            if (a.at() == null) return 1;
            if (b.at() == null) return -1;
            return a.at().compareTo(b.at());
        });
        if (out.size() > maxMessages) {
            return out.subList(out.size() - maxMessages, out.size());
        }
        return out;
    }

    public static Optional<WhatsAppMessage> lastQuoteLike(List<WhatsAppMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return Optional.empty();
        }
        for (int i = messages.size() - 1; i >= 0; i--) {
            if (messages.get(i).quoteLike() && !messages.get(i).system()) {
                return Optional.of(messages.get(i));
            }
        }
        return Optional.empty();
    }

    public static String renderForModel(List<WhatsAppMessage> messages) {
        StringBuilder sb = new StringBuilder();
        for (WhatsAppMessage m : messages) {
            String when = m.at() == null ? "?" : m.at().toString().replace('T', ' ');
            String flag = m.quoteLike() ? " [COTIZACION?]" : "";
            sb.append(when).append(" | ").append(nullToEmpty(m.sender())).append(flag)
                    .append(": ").append(nullToEmpty(m.text())).append('\n');
        }
        return sb.toString();
    }

    private static Matcher matchHeader(String line) {
        Matcher ios = IOS.matcher(line);
        if (ios.matches()) {
            return ios;
        }
        Matcher android = ANDROID.matcher(line);
        return android.matches() ? android : null;
    }

    private static void flush(
            List<WhatsAppMessage> messages,
            LocalDateTime at,
            String sender,
            StringBuilder buf
    ) {
        if (sender == null && buf.isEmpty()) {
            return;
        }
        String text = buf.toString().trim();
        if (text.isEmpty() && (sender == null || sender.isBlank())) {
            return;
        }
        boolean system = sender != null && !sender.contains(":") && SYSTEM.matcher(text + " " + sender).find()
                && !text.contains(":");
        if (sender != null && !sender.contains(":") && text.isEmpty()) {
            system = true;
            text = sender;
            sender = "sistema";
        }
        boolean quote = QUOTE.matcher(text).find();
        messages.add(new WhatsAppMessage(at, sender, text, system, quote));
        buf.setLength(0);
    }

    private static String inferPhone(String filename, List<WhatsAppMessage> messages) {
        if (filename != null) {
            Matcher m = PHONE.matcher(filename);
            if (m.find()) {
                return digits(m.group(1));
            }
        }
        for (WhatsAppMessage msg : messages) {
            Matcher m = PHONE.matcher(msg.sender() + " " + msg.text());
            if (m.find()) {
                String d = digits(m.group(1));
                if (d.length() >= 10) {
                    return d;
                }
            }
        }
        return null;
    }

    private static LocalDateTime parseDate(String date, String time) {
        String d = date.replace('-', '/');
        String t = time.toLowerCase(Locale.ROOT)
                .replace("a. m.", "AM")
                .replace("p. m.", "PM")
                .replace("a.m.", "AM")
                .replace("p.m.", "PM")
                .replace("am", "AM")
                .replace("pm", "PM")
                .trim();
        String[] patterns = {
                "d/M/uuuu H:mm:ss",
                "d/M/uuuu H:mm",
                "d/M/uu H:mm:ss",
                "d/M/uu H:mm",
                "d/M/uuuu h:mm:ss a",
                "d/M/uuuu h:mm a",
                "d/M/uu h:mm a"
        };
        String combined = d + " " + t;
        for (String p : patterns) {
            try {
                DateTimeFormatter fmt = new DateTimeFormatterBuilder()
                        .parseCaseInsensitive()
                        .appendPattern(p)
                        .parseDefaulting(ChronoField.SECOND_OF_MINUTE, 0)
                        .toFormatter(Locale.US);
                return LocalDateTime.parse(combined, fmt);
            } catch (DateTimeParseException ignored) {
                // try next
            }
        }
        return null;
    }

    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("\\D+", "");
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
