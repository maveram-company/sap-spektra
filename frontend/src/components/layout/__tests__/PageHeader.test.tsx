import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageHeader from '../PageHeader';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Systems" />);
    expect(screen.getByText('Systems')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<PageHeader title="Systems" description="Manage your SAP systems" />);
    expect(screen.getByText('Manage your SAP systems')).toBeInTheDocument();
  });

  it('does not render description when omitted', () => {
    const { container } = render(<PageHeader title="Systems" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });

  it('renders breadcrumb when provided', () => {
    render(
      <PageHeader
        title="System Detail"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Systems', href: '/systems' },
          { label: 'EP1' },
        ]}
      />,
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Systems')).toBeInTheDocument();
    expect(screen.getByText('EP1')).toBeInTheDocument();
  });

  it('does not render breadcrumb when omitted', () => {
    const { container } = render(<PageHeader title="Systems" />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('renders actions when provided', () => {
    render(
      <PageHeader
        title="Systems"
        actions={<button data-testid="action-btn">Add</button>}
      />,
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
  });
});
