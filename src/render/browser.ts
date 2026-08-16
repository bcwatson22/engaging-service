import puppeteer, { type Browser } from 'puppeteer';

/* --no-sandbox because the container has no user namespaces to sandbox into;
   --disable-dev-shm-usage because most runtimes give /dev/shm 64MB, which
   Chrome exhausts part-way through a render. */
const args = ['--no-sandbox', '--disable-dev-shm-usage'];

/* Set in the image so puppeteer drives the Chromium installed by the package
   manager. Undefined locally, where puppeteer's own download is used. */
const executablePath = (): string | undefined =>
  process.env.PUPPETEER_EXECUTABLE_PATH;

const launch = async (): Promise<Browser> =>
  await puppeteer.launch({
    headless: true,
    args,
    executablePath: executablePath(),
  });

export { launch, args, executablePath };
