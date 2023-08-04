import { test, expect, Locator } from "@playwright/test";
import fs from "fs/promises";

const baseURL = "https://www.goodreads.com";

async function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(promiseFactory, retryCount) {
	try {
		return await promiseFactory();
	} catch (error) {
		console.log(`Retrying ${retryCount} more times...`);
		await wait(Math.floor(Math.random() * 10000));
		if (retryCount <= 0) {
			throw error;
		}
		return await retry(promiseFactory, retryCount - 1);
	}
}

async function optionalInnerText(locator: Locator) {
	try {
		return await locator.innerText({
			timeout: 1000,
		});
	} catch (error) {
		return null;
	}
}

test("fetch quotes", async ({ page }) => {
	await page.goto(new URL("/quotes", baseURL).toString());
	await expect(page).toHaveTitle(/Popular Quotes/);

	const urls = new Array(100).fill(0).map((_, i) => {
		return (
			new URL("/quotes", baseURL).toString() + "?page=" + (i + 1).toString()
		);
	});

	const allQuotes: {
		text: string;
		likes?: number;
		author: string;
		tags: string[];
		title?: string;
	}[] = [];
	for (const url of urls) {
		console.log("Crawling", url);
		await retry(
			() =>
				page.goto(url, {
					timeout: 5000,
				}),
			5
		);

		const quotes = await page.locator(".quote").all();
		const parsedQuotes = await Promise.all(
			quotes.map(async (quote) => {
				const quoteAndAuthor = await quote.locator(".quoteText").innerText();
				const tags = (
					(await optionalInnerText(
						quote.locator(".greyText.smallText.left")
					)) ?? ""
				)
					.split("tags:")[1]
					?.split(",")
					?.map((item) => item.trim());
				const likes = (
					(await optionalInnerText(quote.locator(".right .smallText"))) ?? ""
				)
					.split("likes")[0]
					?.trim();

				const { groups = {} } =
					quoteAndAuthor.match(
						/“(?<text>(.|\n)*)”\n― (?<authorAndTitle>(.*))/
					) ?? {};
				const text = groups.text ?? "";
				const [author, title] =
					groups.authorAndTitle?.split(",").map((item) => item.trim()) ?? [];

				return {
					author,
					likes: likes ? parseInt(likes) : undefined,
					tags,
					text,
					title,
				};
			})
		);

		allQuotes.push(...parsedQuotes);
	}

	console.log(`Found ${allQuotes.length} quotes`);

	await fs.writeFile(
		"./dist/quotes.json",
		JSON.stringify(allQuotes, null, 2),
		"utf-8"
	);
});
