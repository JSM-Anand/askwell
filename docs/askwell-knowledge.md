# Askwell: product FAQ

Askwell is an AI support chat widget for any website. A business adds its product information as text or files, copies one script tag, and gets a chat bot that answers visitor questions from that information.

## What does Askwell do?

Askwell puts a chat button on your website. When a visitor opens it and asks a question, Askwell answers from the product information you added. It only answers from your information. If the answer is not in your information, it says "I don't know".

## How does it work?

1. Add knowledge. Paste text with a title, or upload a file.
2. Paste one script tag into your website.
3. Visitors ask questions in the chat and get answers from what you added.

## How do I install the widget?

Sign up, create a project, and open the Install page in the dashboard. It shows a script tag with your project's public key and a copy button. Paste that script tag into your HTML page and the chat button appears. The script tag looks like this: a script element whose src is your Askwell address followed by /widget.js, with a data-key attribute holding your project's public key.

The widget does not touch the rest of your page. The button lives in an isolated shadow root, so your page styles do not affect it, and it does not change your page styles.

## What can I add as knowledge?

You can paste text with a title, or upload a file. Supported files are PDF, Markdown and plain text (TXT). A file can be up to 10 MB. Files and pasted texts count toward the same limit of knowledge sources per project.

## What are the plans and limits?

There are two plans, Free and Pro.

| | Free | Pro |
|---|---|---|
| Price | Free | $19 per month |
| Projects | 1 | 5 |
| Messages per month, per project | 100 | 2,000 |
| Knowledge sources per project | 3 | 25 |
| Button color | Default | Any |
| Button position | Bottom right | Any corner |
| Button label | Default | Custom |
| Open animation | Fade | Fade, slide or scale |
| Header text | Default | Custom |
| "Powered by" badge | Shown | Hidden |

## How much is Pro?

Pro costs $19 per month. It is paid through Clerk Billing.

## Can I try Askwell for free?

Yes. The Free plan includes one project, 100 messages per month for that project, and 3 knowledge sources. You can set up the chat and upgrade to Pro later.

## What happens when I reach the monthly message limit?

When a project reaches its monthly message limit, the widget shows a short message that the limit was reached, and no answer is generated. The count starts again each month. You can see the messages used this month, against the limit, for each project in the dashboard.

## How do I upgrade to Pro?

Open the Billing page in the dashboard and choose Pro in the pricing table. After you pay, your plan updates within a few seconds. You can manage your subscription from the same page.

## Can I change how the widget looks?

Yes, on the Pro plan. The Customize page lets you change the button color, the button position (any corner), the button label, the open animation (fade, slide or scale), the header text, and whether the "Powered by" badge is shown. A live preview shows your changes before you save. On the Free plan the Customize page is visible but locked. The change shows on your website the next time a page loads the widget.

## Can I see what visitors asked?

Yes. The Conversations page lists the chats for each project, newest first, with the first message, the number of messages and the time. Open a chat to read the full conversation between the visitor and the bot. The page does not update live. Use the refresh button to see new chats.

## How accurate are the answers?

Askwell answers only from the knowledge you add. For each question it finds the most relevant parts of your knowledge and answers from them. If your knowledge does not cover the question, it says "I don't know". Keep your knowledge up to date so the answers stay correct.

## How long can a visitor's message be?

A message can be up to 1,000 characters.

## Is there protection against abuse?

Yes. Each project is limited to 20 messages per minute per visitor address. Messages that try to make the bot ignore its instructions are blocked and never reach the AI. Visitor messages are shown as plain text.

## What AI does Askwell use, and what about privacy?

Askwell's AI runs on Google Gemini, on Google's free tier. Visitor questions and the matching parts of your knowledge are sent to Gemini to write the answer. Your knowledge is stored per project, and answers for one project only use that project's knowledge. The public key in your script tag only identifies your project. It gives no access to your account. Sign-in is handled by Clerk.

## Can I use Askwell with a team?

No. An Askwell account is for one person. Teams with several members on one account are not supported.

## What is not supported?

Askwell does not support DOCX or spreadsheet uploads, website scraping, a live view of conversations, handing a chat over to a human, or choosing between several AI providers.

## How do I get started?

Click "Start free" on the Askwell landing page, sign up, create a project, add your knowledge, and copy the script tag from the Install page.
