import Box from '@mui/material/Box';

// Matches Figma's DataGridTable status-chip cells (structure node 11:33089,
// devices node 105:109741/105:109779: outlined pill for success/warning/
// unknown, filled pill for error) — a plain MUI Chip doesn't have a variant
// that mixes "outlined" with these exact token colors, so this reproduces
// the four tones directly.
const TONE_STYLES = {
  success: { border: 'rgba(46,125,50,0.5)', color: '#2e7d32', bgcolor: 'transparent' },
  warning: { border: 'rgba(239,108,0,0.5)', color: '#ef6c00', bgcolor: 'transparent' },
  error: { border: 'transparent', color: '#fff', bgcolor: '#d32f2f' },
  default: { border: '#bdbdbd', color: 'rgba(0,0,0,0.6)', bgcolor: 'transparent' },
};

export default function StatusChip({ tone = 'default', label }) {
  const style = TONE_STYLES[tone] ?? TONE_STYLES.default;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: '6px',
        py: '3px',
        borderRadius: 999,
        border: '1px solid',
        borderColor: style.border,
        color: style.color,
        bgcolor: style.bgcolor,
        fontSize: 13,
        lineHeight: '18px',
        letterSpacing: '0.16px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  );
}
