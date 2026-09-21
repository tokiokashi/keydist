import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/analyzer')({
  component: AnalyzerBridge,
});

function AnalyzerBridge() {
  const legacyUrl = `${import.meta.env.BASE_URL}legacy.html`;

  useEffect(() => {
    window.location.replace(legacyUrl);
  }, [legacyUrl]);

  return (
    <section className="route-status">
      <h1>Analyzer</h1>
      <p>既存Analyzerへ移動している。</p>
      <a href={legacyUrl}>移動しない場合はこちら</a>
    </section>
  );
}
