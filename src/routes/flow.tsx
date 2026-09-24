import { createFileRoute } from '@tanstack/react-router';
import { BigramVectorView } from '../features/bigram-vector/bigram-vector-view.tsx';

export const Route = createFileRoute('/flow')({
  component: BigramVectorView,
});
