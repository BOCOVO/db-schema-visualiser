import { ExpandIcon } from "lucide-react";
import PropTypes from "prop-types";

import ToolbarButton from "../Button";

interface FitToViewButtonProps {
  onClick: () => void;
}

const FitToViewButton: React.FC<FitToViewButtonProps> = ({ onClick }) => {
  return (
    <ToolbarButton onClick={onClick} title="Fit-to-view">
      <ExpandIcon />
      <span className="ml-2">Fit To View</span>
    </ToolbarButton>
  );
};
FitToViewButton.propTypes = {
  onClick: PropTypes.func.isRequired,
};

export default FitToViewButton;
