import { createFileRoute } from '@tanstack/react-router';
import { InputConverterView } from '../features/input-converter/input-converter-view.tsx';

export const Route = createFileRoute('/input')({
  component: InputConverterView,
});
