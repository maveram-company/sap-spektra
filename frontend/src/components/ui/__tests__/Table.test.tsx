import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../Table';

function renderFullTable() {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>System A</TableCell>
          <TableCell>Active</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>System B</TableCell>
          <TableCell>Inactive</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('renders a table element', () => {
    renderFullTable();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders children inside the table', () => {
    renderFullTable();
    expect(screen.getByText('System A')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('wraps the table in an overflow container', () => {
    const { container } = renderFullTable();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper.querySelector('table')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <Table className="custom-table">
        <tbody><tr><td>Cell</td></tr></tbody>
      </Table>
    );
    expect(container.firstChild).toHaveClass('custom-table');
  });
});

describe('TableHeader', () => {
  it('renders a thead element', () => {
    const { container } = render(
      <table>
        <TableHeader>
          <tr><th>Col</th></tr>
        </TableHeader>
      </table>
    );
    expect(container.querySelector('thead')).toBeInTheDocument();
  });

  it('applies border and background classes', () => {
    const { container } = render(
      <table>
        <TableHeader>
          <tr><th>Col</th></tr>
        </TableHeader>
      </table>
    );
    const thead = container.querySelector('thead') as HTMLElement;
    expect(thead.className).toContain('border-b');
  });
});

describe('TableBody', () => {
  it('renders a tbody element', () => {
    const { container } = render(
      <table>
        <TableBody>
          <tr><td>Cell</td></tr>
        </TableBody>
      </table>
    );
    expect(container.querySelector('tbody')).toBeInTheDocument();
  });

  it('applies divide classes', () => {
    const { container } = render(
      <table>
        <TableBody>
          <tr><td>Cell</td></tr>
        </TableBody>
      </table>
    );
    const tbody = container.querySelector('tbody') as HTMLElement;
    expect(tbody.className).toContain('divide-y');
  });
});

describe('TableRow', () => {
  it('renders a tr element', () => {
    renderFullTable();
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('applies border and hover classes', () => {
    const { container } = render(
      <table><tbody>
        <TableRow><td>Cell</td></TableRow>
      </tbody></table>
    );
    const tr = container.querySelector('tr') as HTMLElement;
    expect(tr.className).toContain('border-b');
    expect(tr.className).toContain('hover:bg-white/[0.03]');
  });

  it('applies custom className', () => {
    const { container } = render(
      <table><tbody>
        <TableRow className="highlight"><td>Cell</td></TableRow>
      </tbody></table>
    );
    const tr = container.querySelector('tr') as HTMLElement;
    expect(tr.className).toContain('highlight');
  });

  it('calls onClick when row is clicked', () => {
    const handler = vi.fn();
    const { container } = render(
      <table><tbody>
        <TableRow onClick={handler}><td>Clickable</td></TableRow>
      </tbody></table>
    );
    fireEvent.click(container.querySelector('tr')!);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('sets role="button" and tabIndex when onClick is provided', () => {
    const handler = vi.fn();
    const { container } = render(
      <table><tbody>
        <TableRow onClick={handler}><td>Clickable</td></TableRow>
      </tbody></table>
    );
    const tr = container.querySelector('tr') as HTMLElement;
    expect(tr).toHaveAttribute('role', 'button');
    expect(tr).toHaveAttribute('tabindex', '0');
  });

  it('does not set role or tabIndex when onClick is not provided', () => {
    const { container } = render(
      <table><tbody>
        <TableRow><td>Plain</td></TableRow>
      </tbody></table>
    );
    const tr = container.querySelector('tr') as HTMLElement;
    expect(tr).not.toHaveAttribute('role');
    expect(tr).not.toHaveAttribute('tabindex');
  });

  it('triggers onClick on Enter key', () => {
    const handler = vi.fn();
    const { container } = render(
      <table><tbody>
        <TableRow onClick={handler}><td>Keyboard</td></TableRow>
      </tbody></table>
    );
    fireEvent.keyDown(container.querySelector('tr')!, { key: 'Enter' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('triggers onClick on Space key', () => {
    const handler = vi.fn();
    const { container } = render(
      <table><tbody>
        <TableRow onClick={handler}><td>Keyboard</td></TableRow>
      </tbody></table>
    );
    fireEvent.keyDown(container.querySelector('tr')!, { key: ' ' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not trigger onClick on other keys', () => {
    const handler = vi.fn();
    const { container } = render(
      <table><tbody>
        <TableRow onClick={handler}><td>Keyboard</td></TableRow>
      </tbody></table>
    );
    fireEvent.keyDown(container.querySelector('tr')!, { key: 'Tab' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('applies cursor-pointer when onClick is provided', () => {
    const handler = vi.fn();
    const { container } = render(
      <table><tbody>
        <TableRow onClick={handler}><td>Cell</td></TableRow>
      </tbody></table>
    );
    expect((container.querySelector('tr') as HTMLElement).className).toContain('cursor-pointer');
  });
});

describe('TableHead', () => {
  it('renders a th element with scope="col"', () => {
    const { container } = render(
      <table><thead><tr>
        <TableHead>Header</TableHead>
      </tr></thead></table>
    );
    const th = container.querySelector('th') as HTMLElement;
    expect(th).toHaveAttribute('scope', 'col');
    expect(th).toHaveTextContent('Header');
  });

  it('applies uppercase and font classes', () => {
    const { container } = render(
      <table><thead><tr>
        <TableHead>Header</TableHead>
      </tr></thead></table>
    );
    const th = container.querySelector('th') as HTMLElement;
    expect(th.className).toContain('uppercase');
    expect(th.className).toContain('font-semibold');
  });

  it('appends custom className', () => {
    const { container } = render(
      <table><thead><tr>
        <TableHead className="extra">Header</TableHead>
      </tr></thead></table>
    );
    expect((container.querySelector('th') as HTMLElement).className).toContain('extra');
  });
});

describe('TableCell', () => {
  it('renders a td element', () => {
    const { container } = render(
      <table><tbody><tr>
        <TableCell>Cell value</TableCell>
      </tr></tbody></table>
    );
    const td = container.querySelector('td') as HTMLElement;
    expect(td).toHaveTextContent('Cell value');
  });

  it('applies padding classes', () => {
    const { container } = render(
      <table><tbody><tr>
        <TableCell>Cell</TableCell>
      </tr></tbody></table>
    );
    const td = container.querySelector('td') as HTMLElement;
    expect(td.className).toContain('px-4');
    expect(td.className).toContain('py-3');
  });

  it('appends custom className', () => {
    const { container } = render(
      <table><tbody><tr>
        <TableCell className="special">Cell</TableCell>
      </tr></tbody></table>
    );
    expect((container.querySelector('td') as HTMLElement).className).toContain('special');
  });
});
