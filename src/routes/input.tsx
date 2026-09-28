import { createFileRoute } from '@tanstack/react-router';
import { InputConverterView } from '#tester/input-converter-view.tsx';

export const Route = createFileRoute('/input')({
  component: InputConverterView,
});
