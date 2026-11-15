import {
  DemoPlaceholder,
  Footer,
  Hero,
  HowItWorks,
  InstallSnippet,
  Pricing,
} from '../components/landing';

export default function Home() {
  return (
    <div className="theme-dark min-h-dvh overflow-x-clip">
      <main>
        <Hero />
        <HowItWorks />
        <DemoPlaceholder />
        <Pricing />
        <InstallSnippet />
      </main>
      <Footer />
    </div>
  );
}
