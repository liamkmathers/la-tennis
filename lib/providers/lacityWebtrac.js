const WEBTRAC_BASE = "https://reg.recreation.parks.lacity.gov/web/wbwsc/webtrac.wsc/search.html";

const FACILITIES = [
  {
    id: "cheviot-hills",
    name: "Cheviot Hills",
    location: "Cheviot Hills Pay Tennis",
    address: "2551 Motor Ave, Los Angeles, CA 90064",
    neighborhood: "Cheviot Hills",
    reserveUrl:
      "https://recreation.parks.lacity.gov/discover-activities?reserve=true&location=Cheviot%20Hills%20Pay%20Tennis",
    referer:
      "https://recreation.parks.lacity.gov/discover-activities?reserve=true&location=Cheviot%20Hills%20Pay%20Tennis"
  },
  {
    id: "westwood",
    name: "Westwood",
    location: "Westwood Pay Tennis",
    address: "1350 Sepulveda Blvd, Los Angeles, CA 90024",
    neighborhood: "Westwood",
    reserveUrl: "https://recreation.parks.lacity.gov/discover-activities?reserve=true&location=Westwood%20Pay%20Tennis",
    referer: "https://recreation.parks.lacity.gov/discover-activities?reserve=true&location=Westwood%20Pay%20Tennis"
  }
];

const decodeEntities = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

const stripTags = (value) => decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const compactTime = (value) => value.replace(/\s+/g, " ").trim().toUpperCase();

const timeToMinutes = (value) => {
  const match = compactTime(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (match[3] === "PM" && hours !== 12) hours += 12;
  if (match[3] === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const dateToIso = (value) => {
  const [month, day, year] = value.split("/").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const formatWebtracDate = (date) =>
  `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;

const priceForStart = (price, startMinutes) => {
  if (startMinutes >= 16 * 60) return "$12.00";
  return price || "$8.00";
};

function extractResultBlocks(html) {
  return html.split('<div class="result-content">').slice(1);
}

function extractBookableLinks(block) {
  const links = [];
  const linkPattern = /<a\b([^>]*\bsuccess\b[^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(block)) !== null) {
    const hrefMatch = match[1].match(/\bhref="([^"]+)"/i);
    if (!hrefMatch) continue;
    links.push({
      href: decodeEntities(hrefMatch[1]),
      label: stripTags(match[2])
    });
  }
  return links;
}

function parseWebtracHtml(html, facility = FACILITIES[0]) {
  return extractResultBlocks(html).flatMap((block) => {
    const courtName = stripTags(block.match(/<h2>\s*<span>([\s\S]*?)<\/span>\s*<\/h2>/i)?.[1] ?? "");
    const date = block.match(/class="dateblock"[^>]*data-tooltip="([^"]+)"/i)?.[1];
    const location = stripTags(
      block.match(/data-title="Location Description">([\s\S]*?)<\/td>/i)?.[1] ?? "Cheviot Hills Pay Tennis"
    );
    const classDescription = stripTags(block.match(/data-title="Class Description">([\s\S]*?)<\/td>/i)?.[1] ?? "");
    const price = stripTags(block.match(/data-title="Price">([\s\S]*?)<\/td>/i)?.[1] ?? "");

    if (!courtName || !date) return [];

    return extractBookableLinks(block).flatMap((link) => {
      const [startLabel, endLabel] = link.label.split(" - ");
      const startMinutes = timeToMinutes(startLabel ?? "");
      const endMinutes = timeToMinutes(endLabel ?? "");
      if (startMinutes === null || endMinutes === null) return [];

      const url = new URL(link.href, WEBTRAC_BASE);
      const fmid = url.searchParams.get("FRFMIDList") ?? courtName.toLowerCase().replace(/\W+/g, "-");

      return {
        id: `lacity-${facility.id}-${fmid}-${date}-${startMinutes}-${endMinutes}`,
        sourceId: "lacity-webtrac",
        venue: `${facility.name} ${courtName}`,
        neighborhood: facility.neighborhood,
        address: facility.address,
        date: dateToIso(date),
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(endMinutes),
        courts: 1,
        price: priceForStart(price, startMinutes),
        surface: "Hard",
        lights: endMinutes > 18 * 60,
        indoor: false,
        bookingUrl: facility.reserveUrl,
        reservationUrl: url.toString(),
        facility: location,
        classDescription
      };
    });
  });
}

async function fetchFacilityAvailability(facility, { date = new Date(Date.now() + 24 * 60 * 60 * 1000) } = {}) {
  const params = new URLSearchParams({
    location: facility.location,
    InterfaceParameter: "Iframe_Live_WebTrac",
    module: "FR",
    date: formatWebtracDate(date),
    begintime: "8:00 am",
    frwebsearch_buttonsearch: "yes"
  });

  const response = await fetch(`${WEBTRAC_BASE}?${params.toString()}`, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      referer: facility.referer,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(25000)
  });

  if (!response.ok) {
    throw new Error(`WebTrac returned ${response.status}`);
  }

  const html = await response.text();
  return parseWebtracHtml(html, facility);
}

const facilityMatchesArea = (facility, area) =>
  !area || area === "all" || facility.neighborhood === area || facility.id === area;

export async function fetchLacityWebtracAvailability({ date, area } = {}) {
  const facilities = FACILITIES.filter((facility) => facilityMatchesArea(facility, area));
  const settled = await Promise.allSettled(
    facilities.map((facility) => fetchFacilityAvailability(facility, { date }))
  );
  const slots = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const errors = settled.flatMap((result, index) =>
    result.status === "rejected" ? [`${facilities[index].name}: ${result.reason.message}`] : []
  );

  if (!slots.length && errors.length) {
    throw new Error(errors.join("; "));
  }

  return { slots, errors };
}

export { FACILITIES as lacityFacilities, parseWebtracHtml };
