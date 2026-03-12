import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AIAnalysisPage from '../AIAnalysisPage';

vi.mock('../../hooks/usePlan', () => ({
  usePlan: () => ({
    hasFeature: () => true,
    currentPlan: { id: 'professional', features: ['ai_analysis'] },
  }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getAIUseCases: vi.fn().mockResolvedValue([
      { id: 'UC1', name: 'Análisis de Incidentes', description: 'Correlación automática de alertas y root cause analysis', query: 'Analiza el incidente de CPU en EP1', color: 'danger' },
      { id: 'UC2', name: 'Predicción de Disco', description: 'Predicción de llenado de disco con ML', query: 'Predice cuándo se llena el disco de EP1', color: 'warning' },
      { id: 'UC3', name: 'Safety Gate', description: 'Validación de cambios antes de deploy', query: 'Ejecuta safety gate para el transporte EP1K900001', color: 'primary' },
    ]),
    getAIResponses: vi.fn().mockResolvedValue({
      incidente: 'Análisis de incidente completado.',
      disco: 'Predicción de disco generada.',
      safety: 'Safety gate validado.',
      estado: 'Estado general de los sistemas.',
    }),
  },
}));

describe('AIAnalysisPage', () => {
  it('renders the page header', async () => {
    render(
      <MemoryRouter>
        <AIAnalysisPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Analisis IA')).toBeInTheDocument();
    });
  });

  it('renders AI use case cards', async () => {
    render(
      <MemoryRouter>
        <AIAnalysisPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Análisis de Incidentes')).toBeInTheDocument();
      expect(screen.getByText('Predicción de Disco')).toBeInTheDocument();
      expect(screen.getByText('Safety Gate')).toBeInTheDocument();
    });
  });

  it('renders the chat interface with welcome message', async () => {
    render(
      <MemoryRouter>
        <AIAnalysisPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Chat IA')).toBeInTheDocument();
      expect(screen.getByText(/Bienvenido al Análisis IA/)).toBeInTheDocument();
    });
  });

  it('renders the message input field', async () => {
    render(
      <MemoryRouter>
        <AIAnalysisPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Escribe tu consulta SAP...')).toBeInTheDocument();
    });
  });
});
